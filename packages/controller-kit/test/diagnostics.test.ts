import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalClient } from '../src/dev';
import {
  createDiagnosticsOverlay,
  diagnosticsEnabled,
  formatDiagnostics,
} from '../src/diagnostics/overlay';

let root: HTMLElement;
beforeEach(() => {
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  root.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const status = () => root.querySelector('.pcg-diag-status')!.textContent;

describe('diagnostics overlay', () => {
  it('diagnosticsEnabled reads ?debug=1', () => {
    expect(diagnosticsEnabled('?debug=1')).toBe(true);
    expect(diagnosticsEnabled('?debug=0')).toBe(false);
    expect(diagnosticsEnabled('')).toBe(false);
  });

  it('collect works with no client and nothing else', () => {
    const d = createDiagnosticsOverlay({ root });
    const r = d.collect();
    expect(r.capabilities).toBeDefined();
    expect(r.state.wakeLockHeld).toBeNull();
    expect(() => formatDiagnostics(r)).not.toThrow();
    d.destroy();
  });

  it('collect includes stats, ids and wake-lock state', () => {
    const client = createLocalClient();
    client.setHostStatus('away');
    const d = createDiagnosticsOverlay({
      root,
      client,
      game: 'g',
      version: '1.2.3',
      wakeLock: { supported: true, held: true, request: async () => true, release() {} },
      extra: () => ({ mode: 'test' }),
    });
    const r = d.collect();
    expect(r.connection.status).toBe('open');
    expect(r.connection.rttMs).toBe(12);
    expect(r.connection.playerId).toBe('dev');
    expect(r.connection.hostStatus).toBe('away');
    expect(r.state.wakeLockHeld).toBe(true);
    expect(r.game).toBe('g');
    const text = formatDiagnostics(r);
    expect(text).toContain('rttMs: 12');
    expect(text).toContain('mode: test');
    expect(text).toContain('capabilities:');
    d.destroy();
  });

  it('records events and caps them at 50', () => {
    const client = createLocalClient();
    const d = createDiagnosticsOverlay({ root, client });
    client.setStatus('reconnecting');
    client.setHostStatus('away');
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('freeze'));
    window.dispatchEvent(new Event('pageshow'));
    window.dispatchEvent(new Event('offline'));
    const kinds = d.collect().events.map((e) => e.kind);
    expect(kinds).toEqual(['status', 'host', 'visibility', 'freeze', 'pageshow', 'offline']);
    for (let i = 0; i < 80; i++) window.dispatchEvent(new Event('blur'));
    expect(d.collect().events).toHaveLength(50);
    d.destroy();
    window.dispatchEvent(new Event('focus'));
    expect(d.collect().events.some((e) => e.kind === 'focus')).toBe(false);
  });

  it('pill toggles the panel and refreshes only while open', () => {
    vi.useFakeTimers();
    const d = createDiagnosticsOverlay({ root });
    const pill = root.querySelector<HTMLButtonElement>('.pcg-diag-pill')!;
    expect(root.querySelector('.pcg-diag-panel')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    pill.click();
    expect(root.querySelector('.pcg-diag-panel')).not.toBeNull();
    expect(root.querySelectorAll('.pcg-diag-row').length).toBeGreaterThan(5);
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(1100);
    expect(root.querySelector('.pcg-diag-panel')!.textContent).toContain('online');
    root.querySelector<HTMLButtonElement>('.pcg-diag-close')!.click();
    expect(root.querySelector('.pcg-diag-panel')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    d.destroy();
    expect(root.querySelector('.pcg-diag-pill')).toBeNull();
  });

  it('copies through the clipboard API when available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('isSecureContext', true);
    const d = createDiagnosticsOverlay({ root });
    root.querySelector<HTMLButtonElement>('.pcg-diag-pill')!.click();
    root.querySelector<HTMLButtonElement>('.pcg-diag-copy-btn')!.click();
    await vi.waitFor(() => expect(status()).toBe('Copied'));
    expect(writeText).toHaveBeenCalledOnce();
    d.destroy();
  });

  it('falls back to a textarea and execCommand, then to a visible textarea', async () => {
    vi.stubGlobal('navigator', {});
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    const d = createDiagnosticsOverlay({ root });
    root.querySelector<HTMLButtonElement>('.pcg-diag-pill')!.click();
    const btn = root.querySelector<HTMLButtonElement>('.pcg-diag-copy-btn')!;
    btn.click();
    await vi.waitFor(() => expect(status()).toBe('Copied'));
    expect(exec).toHaveBeenCalledWith('copy');

    exec.mockReturnValue(false);
    btn.click();
    await vi.waitFor(() => expect(status()).toContain('manually'));
    expect(root.querySelector<HTMLTextAreaElement>('textarea')!.value).toContain('capabilities:');
    d.destroy();
    delete (document as unknown as { execCommand?: unknown }).execCommand;
  });

  it('formatDiagnostics lists the timeline with relative seconds', () => {
    const d = createDiagnosticsOverlay({ root });
    window.dispatchEvent(new Event('focus'));
    const text = formatDiagnostics(d.collect());
    expect(text).toMatch(/-?\d+\.\ds\s+focus/);
    d.destroy();
  });
});
