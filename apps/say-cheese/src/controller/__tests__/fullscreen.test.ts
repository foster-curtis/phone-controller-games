// Manual full screen (PLATFORM §3, controller-compat): the phone never asks for full screen by itself.
// The shell's corner button and the lobby's inline one are the only ways in, and every optional
// browser API may be missing.
import { createLocalClient, type LocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app';
import { sampleScreens } from '../dev';
import { createFakeCamera } from '../fakeCamera';

let root: HTMLElement;
let client: LocalClient;
let app: App;
let request: ReturnType<typeof vi.fn>;

beforeEach(() => {
  request = vi.fn(() => Promise.resolve());
  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    value: request,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
  root = document.createElement('div');
  document.body.append(root);
  client = createLocalClient();
  app = createApp({
    root,
    client,
    camera: createFakeCamera(),
    platform: { viewport: false },
  });
  client.emit({ t: 'screen', screen: sampleScreens().lobby });
});
afterEach(() => {
  app.destroy();
  root.remove();
  delete (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen;
});

describe('full screen', () => {
  it('is never requested by taps on the page', () => {
    for (const target of [root, root.querySelector('main')!]) {
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('has an inline button in the lobby and a corner button, top-left', () => {
    expect(root.querySelector('button[data-action=fullscreen]')).not.toBeNull();
    const corner = root.querySelector<HTMLElement>('.pcg-fullscreen-corner');
    expect(corner).not.toBeNull();
    expect(corner!.style.left).toContain('8px');
    expect(corner!.style.top).toContain('8px');
  });

  it('is requested only by a tap on a button', async () => {
    const inline = root.querySelector<HTMLButtonElement>('button[data-action=fullscreen]')!;
    inline.click(); // detail 0: keyboard / script activation counts as deliberate
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('shows the inline button on the join form too', () => {
    client.emit({ t: 'screen', screen: sampleScreens().joining });
    expect(
      root.querySelector('[data-screen=joining] button[data-action=fullscreen]'),
    ).not.toBeNull();
  });
});
