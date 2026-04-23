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
import { fetchMessages } from "@/lib/api";
import { markAsRead, deleteMessages, setMessageStarred, getStarredIds } from "@/lib/api";
import { decryptMessage } from "@/lib/crypto";
import {
  cacheMessages,
  getCachedMessages,
  markCachedRead,
  deleteCachedMessages,
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
  fetchAndDecrypt: (
    token: string,
    privateKeyHex: string,
    options?: { since?: number; append?: boolean }
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
  setActiveTab: (tab: string) => void;
  setActiveGroup: (group: string | null) => void;
  clear: () => void;
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

  fetchAndDecrypt: async (token, privateKeyHex, options = {}) => {
    set({ loading: true, error: null });

    try {
      const response = await fetchMessages(token, {
        since: options.since,
        limit: 50,
      });

      const decrypted: Message[] = [];
      for (const enc of response.messages) {
        try {
          const plain = decryptMessage(privateKeyHex, enc.encrypted_data);
          decrypted.push({
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
          decrypted.push({
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

      // Cache decrypted messages
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

      if (options.append) {
        const existing = get().messages;
        const existingIds = new Set(existing.map((m) => m.id));
        const newMsgs = decrypted.filter((m) => !existingIds.has(m.id));
        set({
          messages: [...existing, ...newMsgs].sort(
            (a, b) => b.timestamp - a.timestamp
          ),
          totalUnread: response.total_unread,
          hasMore: response.has_more,
          loading: false,
        });
      } else {
        set({
          messages: decrypted.sort((a, b) => b.timestamp - a.timestamp),
          totalUnread: response.total_unread,
          hasMore: response.has_more,
          loading: false,
        });
      }
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
