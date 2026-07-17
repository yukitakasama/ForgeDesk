import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SendShortcut = "enter" | "ctrl-enter";
export type FollowUpBehavior = "queue" | "steer";
export type CompletionNotification = "always" | "unfocused" | "never";
export type AppearanceTheme = "system" | "light" | "dark";
export type ReduceMotion = "system" | "on" | "off";
export type DiffMarker = "color" | "sign";

export interface AppearancePreferences {
  theme: AppearanceTheme;
  accentColor: string;
  lightBackground: string;
  lightForeground: string;
  darkBackground: string;
  darkForeground: string;
  uiFont: string;
  codeFont: string;
  lightTranslucentSidebar: boolean;
  darkTranslucentSidebar: boolean;
  lightContrast: number;
  darkContrast: number;
  pointerCursor: boolean;
  reduceMotion: ReduceMotion;
  uiFontSize: number;
  codeFontSize: number;
  diffMarker: DiffMarker;
}

interface PreferencesState {
  defaultFileTarget: string;
  terminalShell: string;
  uiLanguage: string;
  showBottomPanel: boolean;
  suggestionsEnabled: boolean;
  showContextUsage: boolean;
  sendShortcut: SendShortcut;
  followUpBehavior: FollowUpBehavior;
  popupShortcut: string;
  defaultNoProjectTask: boolean;
  completionNotification: CompletionNotification;
  permissionNotifications: boolean;
  questionNotifications: boolean;
  appearance: AppearancePreferences;
  updatePreference: <Key extends keyof PreferenceValues>(
    key: Key,
    value: PreferenceValues[Key],
  ) => void;
}

type PreferenceValues = Omit<PreferencesState, "updatePreference">;

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      defaultFileTarget: "vscode",
      terminalShell: "powershell",
      uiLanguage: "auto",
      showBottomPanel: false,
      suggestionsEnabled: true,
      showContextUsage: false,
      sendShortcut: "enter",
      followUpBehavior: "queue",
      popupShortcut: "",
      defaultNoProjectTask: false,
      completionNotification: "unfocused",
      permissionNotifications: true,
      questionNotifications: true,
      appearance: {
        theme: "system",
        accentColor: "#339CFF",
        lightBackground: "#FFFFFF",
        lightForeground: "#1A1C1F",
        darkBackground: "#181818",
        darkForeground: "#FFFFFF",
        uiFont: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        codeFont: "ui-monospace, SFMono-Regular, Consolas, monospace",
        lightTranslucentSidebar: true,
        darkTranslucentSidebar: true,
        lightContrast: 45,
        darkContrast: 60,
        pointerCursor: false,
        reduceMotion: "system",
        uiFontSize: 14,
        codeFontSize: 12,
        diffMarker: "color",
      },
      updatePreference: (key, value) => set({ [key]: value }),
    }),
    {
      name: "forgedesk-preferences",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ updatePreference: _updatePreference, ...preferences }) =>
        preferences,
    },
  ),
);

export function showDesktopNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.requestPermission();
}
