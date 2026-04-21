/**
 * Message store — manages decrypted messages, fetching, and caching.
 *
 * Two data paths:
 * 1. fetchAndDecrypt() — initial load from server (GET /api/messages)
 * 2. ingestPushed()    — real-time: decrypt a message pushed via Web Push
 *
 * After initial load, all new messages arrive via Web Push → ingestPushed().
 * No polling required.
 */

import { create } from "zustand";
import { fetchMessages, type EncryptedMessage } from "@/lib/api";
import { markAsRead } from "@/lib/api";
import { decryptMessage, type DecryptedMessage } from "@/lib/crypto";
import {
  cacheMessages,
  getCachedMessages,
  markCachedRead,
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
  tags: string[];
}

/** Raw pushed message from WebSocket or Service Worker (still encrypted) */
export interface PushedEncryptedMessage {
  id: string;
  encrypted_data: string;
  priority: string;
  content_type: string;
  group: string;
  channel_id?: string;
  group_key?: string;
  timestamp: number;
  is_read: boolean;
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
  /** Ingest a single message pushed in real-time — decrypt and insert, no network call */
  ingestPushed: (
    privateKeyHex: string,
    pushed: PushedEncryptedMessage
  ) => void;
  markRead: (token: string, ids: string[]) => Promise<void>;
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
            tags: plain.tags ?? [],
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
            tags: [],
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

  ingestPushed: (privateKeyHex, pushed) => {
    const existing = get().messages;

    // Deduplicate — skip if already present
    if (existing.some((m) => m.id === pushed.id)) return;

    try {
      const plain = decryptMessage(privateKeyHex, pushed.encrypted_data);
      const msg: Message = {
        id: pushed.id,
        title: plain.title,
        body: plain.body,
        priority: pushed.priority,
        group: pushed.group,
        channel_id: pushed.channel_id ?? "default",
        group_key: pushed.group_key ?? "",
        timestamp: pushed.timestamp,
        is_read: false,
        tags: plain.tags ?? [],
      };

      // Insert at correct position (sorted by timestamp desc)
      const updated = [msg, ...existing].sort(
        (a, b) => b.timestamp - a.timestamp
      );

      set({
        messages: updated,
        totalUnread: get().totalUnread + 1,
      });

      // Cache in background (fire-and-forget)
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
    } catch (err) {
      console.error("Failed to decrypt pushed message:", err);
    }
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
