/**
 * Settings store — theme, notification preferences, etc.
 */

import { create } from "zustand";
import { setPref, getPref } from "@/lib/db";

type Theme = "dark" | "light" | "system";
type FontSize = "small" | "medium" | "large";

interface SettingsState {
  theme: Theme;
  fontSize: FontSize;
  pushEnabled: boolean;

  // Actions
  initialize: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  setFontSize: (size: FontSize) => Promise<void>;
  setPushEnabled: (enabled: boolean) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: "dark",
  fontSize: "medium",
  pushEnabled: false,

  initialize: async () => {
    const theme = (await getPref<Theme>("theme")) ?? "dark";
    const fontSize = (await getPref<FontSize>("fontSize")) ?? "medium";
    const pushEnabled = (await getPref<boolean>("pushEnabled")) ?? false;

    applyTheme(theme);
    applyFontSize(fontSize);
    set({ theme, fontSize, pushEnabled });
  },

  setTheme: async (theme) => {
    await setPref("theme", theme);
    applyTheme(theme);
    set({ theme });
  },

  setFontSize: async (size) => {
    await setPref("fontSize", size);
    applyFontSize(size);
    set({ fontSize: size });
  },

  setPushEnabled: async (enabled) => {
    await setPref("pushEnabled", enabled);
    set({ pushEnabled: enabled });
  },
}));

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function applyFontSize(size: FontSize) {
  const map: Record<FontSize, string> = {
    small: "14px",
    medium: "16px",
    large: "18px",
  };
  document.documentElement.style.fontSize = map[size];
}
