/**
 * Auth store — manages key state (locked/unlocked), private key in memory.
 * Supports "remember password" to auto-unlock on next visit.
 */

import { create } from "zustand";
import {
  generateKeyPair,
  wrapPrivateKey,
  unwrapPrivateKey,
  type WrappedKey,
} from "@/lib/crypto";
import { saveKeyData, getKeyData, clearKeyData, setPref, getPref } from "@/lib/db";

type AuthStatus = "loading" | "no-keys" | "locked" | "unlocked";

const SAVED_PWD_KEY = "saved-master-password";

interface AuthState {
  status: AuthStatus;
  publicKeyHex: string | null;
  privateKeyHex: string | null;
  recipientToken: string | null;
  deviceName: string | null;
  rememberPassword: boolean;

  initialize: () => Promise<void>;
  generateKeys: (password: string, deviceName: string) => Promise<string>;
  unlock: (password: string, remember?: boolean) => Promise<void>;
  lock: () => void;
  setRecipientToken: (token: string, recipientId: string) => Promise<void>;
  reset: () => Promise<void>;
  setRememberPassword: (v: boolean) => Promise<void>;
  /** Export all key data as JSON string (for clone transfer). */
  exportBundle: () => Promise<string | null>;
  /** Import key data from JSON string (from clone transfer). */
  importBundle: (bundle: string, password: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  publicKeyHex: null,
  privateKeyHex: null,
  recipientToken: null,
  deviceName: null,
  rememberPassword: false,

  initialize: async () => {
    const keyData = await getKeyData();
    if (!keyData) {
      set({ status: "no-keys" });
      return;
    }

    // Try auto-unlock with saved password
    const savedPwd = await getPref<string>(SAVED_PWD_KEY);
    if (savedPwd) {
      try {
        const privateKeyHex = await unwrapPrivateKey(
          keyData.wrappedPrivateKey as WrappedKey,
          savedPwd
        );
        set({
          status: "unlocked",
          publicKeyHex: keyData.publicKeyHex,
          privateKeyHex,
          recipientToken: keyData.recipientToken ?? null,
          deviceName: keyData.deviceName ?? null,
          rememberPassword: true,
        });
        return;
      } catch {
        // Saved password invalid (maybe keys were regenerated), clear it
        await setPref(SAVED_PWD_KEY, undefined);
      }
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

    // Default: remember password for new setups (no reason to annoy user)
    await setPref(SAVED_PWD_KEY, password);

    set({
      status: "unlocked",
      publicKeyHex,
      privateKeyHex,
      deviceName,
      rememberPassword: true,
    });

    return publicKeyHex;
  },

  unlock: async (password, remember = true) => {
    const keyData = await getKeyData();
    if (!keyData) throw new Error("No keys found");

    const privateKeyHex = await unwrapPrivateKey(
      keyData.wrappedPrivateKey as WrappedKey,
      password
    );

    if (remember) {
      await setPref(SAVED_PWD_KEY, password);
    }

    set({
      status: "unlocked",
      privateKeyHex,
      publicKeyHex: keyData.publicKeyHex,
      recipientToken: keyData.recipientToken ?? null,
      deviceName: keyData.deviceName ?? null,
      rememberPassword: remember,
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

  setRememberPassword: async (v: boolean) => {
    if (!v) {
      await setPref(SAVED_PWD_KEY, undefined);
    }
    set({ rememberPassword: v });
  },

  reset: async () => {
    await clearKeyData();
    await setPref(SAVED_PWD_KEY, undefined);
    set({
      status: "no-keys",
      publicKeyHex: null,
      privateKeyHex: null,
      recipientToken: null,
      deviceName: null,
      rememberPassword: false,
    });
  },

  exportBundle: async () => {
    const keyData = await getKeyData();
    if (!keyData) return null;
    return JSON.stringify(keyData);
  },

  importBundle: async (bundle: string, password: string) => {
    const keyData = JSON.parse(bundle);

    // Verify the password can decrypt the private key
    const privateKeyHex = await unwrapPrivateKey(
      keyData.wrappedPrivateKey as WrappedKey,
      password
    );

    await saveKeyData(keyData);
    await setPref(SAVED_PWD_KEY, password);

    set({
      status: "unlocked",
      publicKeyHex: keyData.publicKeyHex,
      privateKeyHex,
      recipientToken: keyData.recipientToken ?? null,
      deviceName: keyData.deviceName ?? null,
      rememberPassword: true,
    });
  },
}));
