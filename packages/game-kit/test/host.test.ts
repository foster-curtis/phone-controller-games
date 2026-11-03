import { describe, expect, it } from 'vitest';
import { debugEnabled, installDebug } from '../src/debug';
import { qrMatrix } from '../src/qr';
import { relayUrl } from '../src/relayUrl';

describe('relayUrl', () => {
  it('prefers the build URL, else the page host on 8787', () => {
    expect(relayUrl('wss://relay.example', 'tv.local')).toBe('wss://relay.example');
    expect(relayUrl('  wss://relay.example  ', 'tv.local')).toBe('wss://relay.example');
    expect(relayUrl('', '192.168.1.5')).toBe('ws://192.168.1.5:8787');
    expect(relayUrl(undefined, 'localhost')).toBe('ws://localhost:8787');
  });
});

describe('debug hooks', () => {
  it('debugEnabled: dev or ?debug=1 only', () => {
    expect(debugEnabled(true, '')).toBe(true);
    expect(debugEnabled(false, '?code=ABCD&debug=1')).toBe(true);
    expect(debugEnabled(false, '')).toBe(false);
    expect(debugEnabled(false, '?debug=0')).toBe(false);
  });

  it('installDebug sets __pcg on the target', () => {
    const target: { __pcg?: unknown } = {};
    const api = { phase: () => 'lobby' };
    installDebug(api, target);
    expect(target.__pcg).toBe(api);
  });
});

describe('qrMatrix', () => {
  it('returns a square row-major 0/1 matrix', () => {
    const qr = qrMatrix('http://192.168.1.23:5173/play?code=ABCD');
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.modules.length).toBe(qr.size * qr.size);
    expect(qr.modules.every((v) => v === 0 || v === 1)).toBe(true);
    // Finder pattern: the top-left module is dark.
    expect(qr.modules[0]).toBe(1);
    expect(qrMatrix('same')).toEqual(qrMatrix('same'));
  });
});
