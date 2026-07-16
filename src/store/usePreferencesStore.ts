import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type SendShortcut = "enter" | "ctrl-enter";
export type FollowUpBehavior = "queue" | "steer";
export type CompletionNotification = "always" | "unfocused" | "never";

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
