// Relay URL: `VITE_RELAY_URL` when set (production), else the relay on the page's host (LAN dev).

export const DEV_RELAY_PORT = 8787;

export function relayUrl(
  envUrl: string | undefined = import.meta.env.VITE_RELAY_URL,
  hostname: string = globalThis.location?.hostname ?? 'localhost',
): string {
  if (envUrl && envUrl.trim() !== '') return envUrl.trim();
  return `ws://${hostname}:${DEV_RELAY_PORT}`;
}
