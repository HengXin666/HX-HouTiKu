/**
 * Message store — manages decrypted messages, fetching, and caching.
 */

import { create } from "zustand";
import { fetchMessages, markAsRead, type EncryptedMessage } from "@/lib/api";
import { decryptMessage, type DecryptedMessage } from "@/lib/crypto";
import {
  cacheMessages,
  getCachedMessages,
  markCachedRead,
  type CachedMessage,
} from "@/lib/db";

export interface Message {
  id: string;
  title: string;
  body: string;
  priority: string;
  group: string;
  timestamp: number;
  is_read: boolean;
  tags: string[];
}

interface MessageState {
  messages: Message[];
  totalUnread: number;
  loading: boolean;
  error: string | null;
  hasMore: boolean;

  // Active filter
  activeTab: string; // "all" | priority level
  activeGroup: string | null;

  // Actions
  loadCached: () => Promise<void>;
  fetchAndDecrypt: (
    token: string,
    privateKeyHex: string,
    options?: { since?: number; append?: boolean }
  ) => Promise<void>;
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
        messages: cached.map((m) => ({ ...m, tags: m.tags ?? [] })),
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
            timestamp: enc.timestamp,
            is_read: enc.is_read,
            tags: plain.tags ?? [],
          });
        } catch (err) {
          console.error(`Failed to decrypt message ${enc.id}:`, err);
          // Keep the message but mark it as unreadable
          decrypted.push({
            id: enc.id,
            title: "🔒 解密失败",
            body: "无法解密此消息，可能密钥不匹配。",
            priority: enc.priority,
            group: enc.group,
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
