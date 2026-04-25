/**
 * IndexedDB wrapper using `idb` for storing:
 * - Encrypted private key
 * - Message cache (decrypted, optional)
 * - User preferences
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "hx-houtiku";
const DB_VERSION = 1;

interface UPushDB {
  keystore: {
    key: string;
    value: {
      publicKeyHex: string;
      wrappedPrivateKey: {
        salt: string;
        iv: string;
        ciphertext: string;
      };
      recipientToken?: string;
      recipientId?: string;
      deviceName?: string;
    };
  };
  messages: {
    key: string; // message id
    value: {
      id: string;
      title: string;
      body: string;
      priority: string;
      group: string;
      channel_id?: string;
      group_key?: string;
      timestamp: number;
      is_read: boolean;
      tags?: string[];
    };
    indexes: {
      "by-timestamp": number;
      "by-group": string;
      "by-priority": string;
    };
  };
  preferences: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<UPushDB>> | null = null;

function getDB(): Promise<IDBPDatabase<UPushDB>> {
  if (!dbPromise) {
    dbPromise = openDB<UPushDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("keystore")) {
          db.createObjectStore("keystore");
        }
        if (!db.objectStoreNames.contains("messages")) {
          const msgStore = db.createObjectStore("messages", { keyPath: "id" });
          msgStore.createIndex("by-timestamp", "timestamp");
          msgStore.createIndex("by-group", "group");
          msgStore.createIndex("by-priority", "priority");
        }
        if (!db.objectStoreNames.contains("preferences")) {
          db.createObjectStore("preferences");
        }
      },
    }).catch((err) => {
      // IndexedDB 打开失败时清除缓存的 promise，允许下次重试
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

// --- Keystore ---

export async function saveKeyData(data: UPushDB["keystore"]["value"]): Promise<void> {
  const db = await getDB();
  await db.put("keystore", data, "current");
}

export async function getKeyData(): Promise<UPushDB["keystore"]["value"] | undefined> {
  try {
    const db = await getDB();
    return db.get("keystore", "current");
  } catch {
    // IndexedDB 不可用时返回 undefined，由调用方重试
    return undefined;
  }
}

export async function clearKeyData(): Promise<void> {
  const db = await getDB();
  await db.delete("keystore", "current");
}

// --- Messages Cache ---

export type CachedMessage = UPushDB["messages"]["value"];

export async function cacheMessages(messages: CachedMessage[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("messages", "readwrite");
  for (const msg of messages) {
    await tx.store.put(msg);
  }
  await tx.done;
}

export async function getCachedMessages(limit = 100): Promise<CachedMessage[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("messages", "by-timestamp");
  // Reverse for newest first, slice
  return all.reverse().slice(0, limit);
}

// 项目诞生前的时间戳，首次加载时作为增量同步的起点
const PROJECT_EPOCH = new Date("2026-01-01T00:00:00Z").getTime();

/** 获取上次成功同步到的消息时间戳（仅在收到消息时更新，非实时计算） */
export async function getLastMessageSyncTs(): Promise<number> {
  return (await getPref<number>("lastMessageSyncTs")) ?? PROJECT_EPOCH;
}

/** 更新同步到的消息时间戳（传入本批次最新消息的 timestamp） */
export async function setLastMessageSyncTs(ts: number): Promise<void> {
  const current = await getLastMessageSyncTs();
  // 只允许前进，不允许回退
  if (ts > current) {
    await setPref("lastMessageSyncTs", ts);
  }
}

export async function markCachedRead(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("messages", "readwrite");
  for (const id of ids) {
    const msg = await tx.store.get(id);
    if (msg) {
      msg.is_read = true;
      await tx.store.put(msg);
    }
  }
  await tx.done;
}

export async function deleteCachedMessages(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("messages", "readwrite");
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

/** 获取上次墓碑同步的时间戳（毫秒），首次默认为项目诞生时间 */
export async function getLastSyncTime(): Promise<number> {
  return (await getPref<number>("lastDeleteSyncTime")) ?? PROJECT_EPOCH;
}

/** 保存墓碑同步时间戳 */
export async function setLastSyncTime(ts: number): Promise<void> {
  await setPref("lastDeleteSyncTime", ts);
}

export async function clearMessages(): Promise<void> {
  const db = await getDB();
  await db.clear("messages");
}

// --- Preferences ---

export async function setPref(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put("preferences", value, key);
}

export async function getPref<T>(key: string): Promise<T | undefined> {
  try {
    const db = await getDB();
    return db.get("preferences", key) as Promise<T | undefined>;
  } catch {
    return undefined;
  }
}

// --- Full Reset ---

export async function resetAll(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear("keystore");
    await db.clear("messages");
    await db.clear("preferences");
    // Close the connection so Android WebView releases the DB lock
    db.close();
  } catch {
    // If DB was already broken, delete it directly
  }
  // Reset the cached promise so next getDB() opens a fresh connection
  dbPromise = null;
}

/**
 * Invalidate the in-memory DB handle.
 * Call after resetAll() or when the DB may be in a stale state.
 */
export function invalidateDB(): void {
  dbPromise = null;
}
