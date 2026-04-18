/**
 * IndexedDB wrapper using `idb` for storing:
 * - Encrypted private key
 * - Message cache (decrypted, optional)
 * - User preferences
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "unified-push";
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
        // Keystore
        if (!db.objectStoreNames.contains("keystore")) {
          db.createObjectStore("keystore");
        }

        // Messages cache
        if (!db.objectStoreNames.contains("messages")) {
          const msgStore = db.createObjectStore("messages", { keyPath: "id" });
          msgStore.createIndex("by-timestamp", "timestamp");
          msgStore.createIndex("by-group", "group");
          msgStore.createIndex("by-priority", "priority");
        }

        // Preferences
        if (!db.objectStoreNames.contains("preferences")) {
          db.createObjectStore("preferences");
        }
      },
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
  const db = await getDB();
  return db.get("keystore", "current");
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
  const db = await getDB();
  return db.get("preferences", key) as Promise<T | undefined>;
}

// --- Full Reset ---

export async function resetAll(): Promise<void> {
  const db = await getDB();
  await db.clear("keystore");
  await db.clear("messages");
  await db.clear("preferences");
}
