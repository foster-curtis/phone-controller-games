// LAN helpers: pick the address phones can reach, and tell when the host page was opened via
// localhost (then its QR would be useless). Pure functions: vite.config.ts passes
// `os.networkInterfaces()`, the Lobby passes `location`.

export interface NetInterfaceInfo {
  address: string;
  family: string | number;
  internal: boolean;
}

export type NetInterfaces = Record<string, readonly NetInterfaceInfo[] | undefined>;

/** Virtual adapters (WSL, Hyper-V, Docker, VMs) that phones on the Wi-Fi can't reach. */
const VIRTUAL_NAME = /vethernet|wsl|docker|virtualbox|vmware|hyper-v|vbox|utun|tailscale|zerotier/i;

function isIPv4(info: NetInterfaceInfo): boolean {
  return info.family === 'IPv4' || info.family === 4;
}

/** Lower is better: 192.168/16, then 10/8, then 172.16/12, then any other routable IPv4. */
function addressRank(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  const m = /^172\.(\d+)\./.exec(address);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 2;
  return 3;
}

/**
 * The best LAN IPv4 address: non-internal, not link-local (169.254/16), physical adapters before
 * virtual ones, private ranges in `addressRank` order. null when there is none.
 */
export function pickLanAddress(interfaces: NetInterfaces): string | null {
  let best: { address: string; score: number } | null = null;
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (!isIPv4(info) || info.internal || info.address.startsWith('169.254.')) continue;
      const score = (VIRTUAL_NAME.test(name) ? 10 : 0) + addressRank(info.address);
      if (!best || score < best.score) best = { address: info.address, score };
    }
  }
  return best?.address ?? null;
}

/** `http://<address>:<port>/` (the TV host page). */
export function hostUrl(address: string, port: number, protocol = 'http'): string {
  return `${protocol}://${address}:${port}/`;
}

/** The line `pnpm dev:lan:sunny-side` prints under Vite's own URLs. */
export function lanBanner(address: string | null, port: number): string {
  if (!address) return '  No LAN IPv4 address found: phones need the TV and phones on one Wi-Fi.';
  return `  TV host (open this on the TV/laptop): ${hostUrl(address, port)}`;
}

/** The phone join link the lobby QR encodes. */
export function joinUrl(origin: string, code: string): string {
  return `${origin}/play?code=${encodeURIComponent(code)}`;
}

/** Phones can't reach these: a QR built from them is useless. */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h.startsWith('127.');
}
