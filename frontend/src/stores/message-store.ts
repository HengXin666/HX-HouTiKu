/**
 * Message store — manages decrypted messages, fetching, and caching.
 *
 * Data paths:
 * 1. fetchAndDecrypt() — load from server (GET /api/messages)
 * 2. addMessage()      — insert a single already-decrypted message (from WS or SW)
 *
 * The store does NOT own any connection logic. WS/SW listeners live in
 * use-messages.ts and call addMessage() after decryption.
 */

import { create } from "zustand";
import { fetchMessages, fetchDeletedIds, type EncryptedMessage } from "@/lib/api";
import { markAsRead, deleteMessages, setMessageStarred, getStarredIds } from "@/lib/api";
import { decryptMessage } from "@/lib/crypto";
import {
  cacheMessages,
  getCachedMessages,
  getLastMessageSyncTs,
  setLastMessageSyncTs,
  markCachedRead,
  deleteCachedMessages,
  getLastSyncTime,
  setLastSyncTime,
  setPref,
} from "@/lib/db";

export interface Message {
  id: string;
  title: string;
  body: string;
  priority: string;
  group: string;
  channel_id: string;
  group_key: string;
  timestamp: number;
  is_read: boolean;
  is_starred: boolean;
  tags: string[];
  /** "ws" | "sw" | "fetch" — where did this message enter the store */
  source?: string;
}

interface MessageState {
  messages: Message[];
  totalUnread: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;

  // Active filter
  activeTab: string;
  activeGroup: string | null;

  // Actions
  loadCached: () => Promise<void>;
  /** 增量同步：从本地缓存最新时间戳开始，循环分页拉取所有新消息 + 拉取墓碑删除日志 */
  syncFromServer: (
    token: string,
    privateKeyHex: string,
  ) => Promise<void>;
  /** 拉取最新一页消息（用于手动刷新、visibility catchup 等场景） */
  fetchAndDecrypt: (
    token: string,
    privateKeyHex: string,
    options?: { since?: number }
  ) => Promise<void>;
  /** Insert a single already-decrypted message. Deduplicates by id. */
  addMessage: (msg: Message) => void;
  /** Remove messages by id (from remote delete sync). */
  removeMessages: (ids: string[]) => void;
  markRead: (token: string, ids: string[]) => Promise<void>;
  deleteMessage: (token: string, ids: string[]) => Promise<void>;
  toggleStar: (token: string, id: string) => void;
  /** Apply star sync from WebSocket (remote device toggled star). */
  applyStarSync: (ids: string[], starred: boolean) => void;
  /** Fetch starred IDs from server and apply them to local state. */
  syncStarredFromServer: (token: string) => Promise<void>;
  /** 从服务器拉取墓碑记录，清理本地缓存中已被删除的消息 */
  syncDeletedFromServer: (token: string) => Promise<void>;
  setActiveTab: (tab: string) => void;
  setActiveGroup: (group: string | null) => void;
  clear: () => void;
}

// 批量解密辅助函数，供 syncFromServer 和 fetchAndDecrypt 共用
function decryptBatch(privateKeyHex: string, messages: EncryptedMessage[]): Message[] {
  const result: Message[] = [];
  for (const enc of messages) {
    try {
      const plain = decryptMessage(privateKeyHex, enc.encrypted_data);
      result.push({
        id: enc.id,
        title: plain.title,
        body: plain.body,
        priority: enc.priority,
        group: enc.group,
        channel_id: enc.channel_id ?? "default",
        group_key: enc.group_key ?? "",
        timestamp: enc.timestamp,
        is_read: enc.is_read,
        is_starred: (enc as any).is_starred ?? false,
        tags: plain.tags ?? [],
        source: "fetch",
      });
    } catch (err) {
      console.error(`Failed to decrypt message ${enc.id}:`, err);
      result.push({
        id: enc.id,
        title: "🔒 解密失败",
        body: "无法解密此消息，可能密钥不匹配。",
        priority: enc.priority,
        group: enc.group,
        channel_id: enc.channel_id ?? "default",
        group_key: enc.group_key ?? "",
        timestamp: enc.timestamp,
        is_read: enc.is_read,
        is_starred: (enc as any).is_starred ?? false,
        tags: [],
        source: "fetch",
      });
    }
  }
  return result;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  totalUnread: 0,
  loading: false,
  error: null,
  hasMore: false,
  activeTab: "all",
  activeGroup: null,

  loadCached: async () => {
    const cached = await getCachedMessages(200);
    if (cached.length > 0) {
      set({
        messages: cached.map((m) => ({
          ...m,
          tags: m.tags ?? [],
          channel_id: m.channel_id ?? "default",
          group_key: m.group_key ?? "",
          is_starred: false,
          source: "cache",
        })),
      });
    }
  },

  syncFromServer: async (token, privateKeyHex) => {
    set({ loading: true, error: null });

    try {
      // 1. 获取上次同步到的消息时间戳作为增量起点
      // 首次加载时为 2026-01-01T00:00:00Z（项目诞生前）
      const latestTs = await getLastMessageSyncTs();

      // 2. 使用 ASC 排序循环分页拉取所有新消息
      // ASC 模式下服务器返回 since 之后最早的 N 条，客户端不断推进 since
      const PAGE_SIZE = 200;
      let since = latestTs;
      let totalUnread = 0;
      let pageHasMore = true;
      // 在循环外维护已有 ID 集合，避免每页重建
      const allIds = new Set(get().messages.map((m) => m.id));

      while (pageHasMore) {
        const response = await fetchMessages(token, {
          since,
          limit: PAGE_SIZE,
          order: "asc",
        });

        totalUnread = response.total_unread;

        if (response.messages.length === 0) {
          pageHasMore = false;
          break;
        }

        const decrypted = decryptBatch(privateKeyHex, response.messages);

        // 写入缓存
        await cacheMessages(
          decrypted.map((m) => ({
            id: m.id,
            title: m.title,
            body: m.body,
            priority: m.priority,
            group: m.group,
            channel_id: m.channel_id,
            group_key: m.group_key,
            timestamp: m.timestamp,
            is_read: m.is_read,
            tags: m.tags,
          }))
        );

        // 合并到内存状态（实时更新 UI）
        const newMsgs = decrypted.filter((m) => !allIds.has(m.id));
        if (newMsgs.length > 0) {
          for (const m of newMsgs) allIds.add(m.id);
          const existing = get().messages;
          set({
            messages: [...existing, ...newMsgs].sort(
              (a, b) => b.timestamp - a.timestamp
            ),
          });
        }

        pageHasMore = response.has_more;

        // ASC 排序下最后一条是本页最新的，推进 since 到本页最新 timestamp
        const newestInPage = response.messages[response.messages.length - 1].timestamp;
        if (newestInPage <= since) {
          break; // 防止死循环
        }
        since = newestInPage;

        // 持久化同步进度：循环内 since 单调递增，直接写入无需读取比较
        await setPref("lastMessageSyncTs", newestInPage);
      }

      // 3. 同步墓碑删除日志
      await get().syncDeletedFromServer(token);

      set({
        totalUnread: totalUnread,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to sync messages",
        loading: false,
      });
    }
  },

  fetchAndDecrypt: async (token, privateKeyHex, options = {}) => {
    set({ loading: true, error: null });

    try {
      const response = await fetchMessages(token, {
        since: options.since,
        limit: 50,
      });

      const decrypted = decryptBatch(privateKeyHex, response.messages);

      // 写入缓存（upsert 语义）
      await cacheMessages(
        decrypted.map((m) => ({
          id: m.id,
          title: m.title,
          body: m.body,
          priority: m.priority,
          group: m.group,
          channel_id: m.channel_id,
          group_key: m.group_key,
          timestamp: m.timestamp,
          is_read: m.is_read,
          tags: m.tags,
        }))
      );

      // 始终使用 append 合并模式，避免覆盖 syncFromServer 已加载的完整消息列表
      const existing = get().messages;
      const existingIds = new Set(existing.map((m) => m.id));
      const newMsgs = decrypted.filter((m) => !existingIds.has(m.id));
      // 同时更新已有消息的 is_read 等状态
      const updatedIds = new Map(decrypted.map((m) => [m.id, m]));
      const merged = existing.map((m) => updatedIds.get(m.id) ?? m);
      set({
        messages: [...merged, ...newMsgs].sort(
          (a, b) => b.timestamp - a.timestamp
        ),
        totalUnread: response.total_unread,
        hasMore: response.has_more,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to fetch messages",
        loading: false,
      });
    }
  },

  addMessage: (msg) => {
    const existing = get().messages;
    // Deduplicate by id
    if (existing.some((m) => m.id === msg.id)) return;

    const updated = [msg, ...existing].sort(
      (a, b) => b.timestamp - a.timestamp
    );

    set({
      messages: updated,
      totalUnread: get().totalUnread + (msg.is_read ? 0 : 1),
    });

    // Cache in background
    cacheMessages([{
      id: msg.id,
      title: msg.title,
      body: msg.body,
      priority: msg.priority,
      group: msg.group,
      channel_id: msg.channel_id,
      group_key: msg.group_key,
      timestamp: msg.timestamp,
      is_read: msg.is_read,
      tags: msg.tags,
    }]).catch(() => {});

    // 更新同步时间戳：只在收到消息时记录
    setLastMessageSyncTs(msg.timestamp).catch(() => {});
  },

  removeMessages: (ids) => {
    const idSet = new Set(ids);
    set((state) => {
      const unreadRemoved = state.messages.filter(
        (m) => idSet.has(m.id) && !m.is_read
      ).length;
      return {
        messages: state.messages.filter((m) => !idSet.has(m.id)),
        totalUnread: Math.max(0, state.totalUnread - unreadRemoved),
      };
    });

    // Clean IndexedDB cache in background
    deleteCachedMessages(ids).catch(() => {});
  },

  markRead: async (token, ids) => {
    await markAsRead(token, ids);
    await markCachedRead(ids);

    set((state) => ({
      messages: state.messages.map((m) =>
        ids.includes(m.id) ? { ...m, is_read: true } : m
      ),
      totalUnread: Math.max(0, state.totalUnread - ids.length),
    }));
  },

  deleteMessage: async (token, ids) => {
    await deleteMessages(token, ids);

    set((state) => {
      const unreadRemoved = state.messages.filter(
        (m) => ids.includes(m.id) && !m.is_read
      ).length;
      return {
        messages: state.messages.filter((m) => !ids.includes(m.id)),
        totalUnread: Math.max(0, state.totalUnread - unreadRemoved),
      };
    });

    // 清理 IndexedDB 缓存, 防止刷新后消息重新出现
    deleteCachedMessages(ids).catch(() => {});
  },

  toggleStar: (token, id) => {
    const msg = get().messages.find((m) => m.id === id);
    if (!msg) return;
    const newStarred = !msg.is_starred;

    // Optimistic update
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, is_starred: newStarred } : m
      ),
    }));

    // Sync to server
    setMessageStarred(token, [id], newStarred).catch((err) => {
      console.error("Failed to sync star:", err);
      // Revert on failure
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === id ? { ...m, is_starred: !newStarred } : m
        ),
      }));
    });
  },

  applyStarSync: (ids, starred) => {
    const idSet = new Set(ids);
    set((state) => ({
      messages: state.messages.map((m) =>
        idSet.has(m.id) ? { ...m, is_starred: starred } : m
      ),
    }));
  },

  syncStarredFromServer: async (token) => {
    try {
      const { starred_ids } = await getStarredIds(token);
      const idSet = new Set(starred_ids);
      set((state) => ({
        messages: state.messages.map((m) => ({
          ...m,
          is_starred: idSet.has(m.id),
        })),
      }));
    } catch (err) {
      console.error("Failed to sync starred from server:", err);
    }
  },

  syncDeletedFromServer: async (token) => {
    try {
      let since = await getLastSyncTime();
      let hasMore = true;

      while (hasMore) {
        const { deleted_ids, latest_deleted_at, has_more } = await fetchDeletedIds(token, since);

        if (deleted_ids.length > 0) {
          // 从内存状态移除
          const idSet = new Set(deleted_ids);
          set((state) => {
            const unreadRemoved = state.messages.filter(
              (m) => idSet.has(m.id) && !m.is_read
            ).length;
            return {
              messages: state.messages.filter((m) => !idSet.has(m.id)),
              totalUnread: Math.max(0, state.totalUnread - unreadRemoved),
            };
          });
          // 从 IndexedDB 缓存移除
          await deleteCachedMessages(deleted_ids);
        }

        // 推进游标到本页最新的 deleted_at
        since = latest_deleted_at;
        hasMore = has_more;
      }

      // 更新同步时间戳
      await setLastSyncTime(since);
    } catch (err) {
      console.error("Failed to sync deleted messages:", err);
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveGroup: (group) => set({ activeGroup: group }),

  clear: () =>
    set({
      messages: [],
      totalUnread: 0,
      loading: false,
      error: null,
      hasMore: false,
    }),
}));
