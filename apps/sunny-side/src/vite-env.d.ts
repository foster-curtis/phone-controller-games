/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Relay WebSocket URL; unset in LAN dev (falls back to ws://<page host>:8787). */
  readonly VITE_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
