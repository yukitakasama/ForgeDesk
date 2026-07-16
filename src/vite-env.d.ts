/// <reference types="vite/client" />

interface Window {
  __TAURI_INTERNALS__?: unknown;
  __FORGEDESK_STORE__?: typeof import("./store/useAppStore").useAppStore;
}
