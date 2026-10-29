// Relay URL: the build's relay URL when set (production `VITE_RELAY_URL`), else the relay on the
// page's host (LAN dev). Apps pass `import.meta.env.VITE_RELAY_URL`; the kit reads no env itself.

export const DEV_RELAY_PORT = 8787;

export function relayUrl(
  envUrl?: string,
  hostname: string = globalThis.location?.hostname ?? 'localhost',
): string {
  if (envUrl && envUrl.trim() !== '') return envUrl.trim();
  return `ws://${hostname}:${DEV_RELAY_PORT}`;
}
