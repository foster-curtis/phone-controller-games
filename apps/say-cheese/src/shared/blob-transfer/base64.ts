// Base64 helpers for photo transfer (SPEC §7.4). Plain `btoa`/`atob`, so they run the same in
// browsers and Node 22 (no `Buffer`, no `Uint8Array.toBase64`, which older Safari lacks).

// A multiple of 3, so each slice encodes to whole base64 quads and the pieces concatenate cleanly.
const SLICE = 3 * 8192;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += SLICE) {
    const slice = bytes.subarray(i, i + SLICE);
    let bin = '';
    for (let j = 0; j < slice.length; j++) bin += String.fromCharCode(slice[j]!);
    out += btoa(bin);
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export function base64ToBlob(b64: string, type = 'image/jpeg'): Blob {
  return new Blob([base64ToBytes(b64) as Uint8Array<ArrayBuffer>], { type });
}
