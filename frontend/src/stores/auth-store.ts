/**
 * Auth store — manages key state (locked/unlocked), private key in memory.
 */

import { create } from "zustand";
import {
  generateKeyPair,
  wrapPrivateKey,
  unwrapPrivateKey,
  type WrappedKey,
} from "@/lib/crypto";
import { saveKeyData, getKeyData, clearKeyData } from "@/lib/db";

type AuthStatus = "loading" | "no-keys" | "locked" | "unlocked";

interface AuthState {
  status: AuthStatus;
  publicKeyHex: string | null;
  privateKeyHex: string | null; // only in memory when unlocked
  recipientToken: string | null;
  deviceName: string | null;

  // Actions
  initialize: () => Promise<void>;
  generateKeys: (password: string, deviceName: string) => Promise<string>; // returns publicKeyHex
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  setRecipientToken: (token: string, recipientId: string) => Promise<void>;
  reset: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  publicKeyHex: null,
  privateKeyHex: null,
  recipientToken: null,
  deviceName: null,

  initialize: async () => {
    const keyData = await getKeyData();
    if (!keyData) {
      set({ status: "no-keys" });
      return;
    }
    set({
      status: "locked",
      publicKeyHex: keyData.publicKeyHex,
      recipientToken: keyData.recipientToken ?? null,
      deviceName: keyData.deviceName ?? null,
    });
  },

  generateKeys: async (password, deviceName) => {
    const { privateKeyHex, publicKeyHex } = generateKeyPair();
    const wrapped = await wrapPrivateKey(privateKeyHex, password);

    await saveKeyData({
      publicKeyHex,
      wrappedPrivateKey: wrapped,
      deviceName,
    });

    set({
      status: "unlocked",
      publicKeyHex,
      privateKeyHex,
      deviceName,
    });

    return publicKeyHex;
  },

  unlock: async (password) => {
    const keyData = await getKeyData();
    if (!keyData) throw new Error("No keys found");

    const privateKeyHex = await unwrapPrivateKey(
      keyData.wrappedPrivateKey as WrappedKey,
      password
    );

    set({
      status: "unlocked",
      privateKeyHex,
      publicKeyHex: keyData.publicKeyHex,
      recipientToken: keyData.recipientToken ?? null,
      deviceName: keyData.deviceName ?? null,
    });
  },

  lock: () => {
    set({ status: "locked", privateKeyHex: null });
  },

  setRecipientToken: async (token, recipientId) => {
    const keyData = await getKeyData();
    if (!keyData) throw new Error("No keys found");

    await saveKeyData({
      ...keyData,
      recipientToken: token,
      recipientId,
    });

    set({ recipientToken: token });
  },

  reset: async () => {
    await clearKeyData();
    set({
      status: "no-keys",
      publicKeyHex: null,
      privateKeyHex: null,
      recipientToken: null,
      deviceName: null,
    });
  },
}));
