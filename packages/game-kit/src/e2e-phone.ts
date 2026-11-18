// Phone emulation for the cross-browser compat e2e projects (controller-compat F4). Node only.
import { devices, type BrowserContextOptions } from '@playwright/test';

export type PhoneBrowser = 'chromium' | 'firefox' | 'webkit';

/**
 * Context options that make each engine look like a phone: Pixel-like Chromium, iPhone-like WebKit,
 * and for Firefox a phone viewport with touch (Firefox has no `isMobile`). `landscape` is for games
 * whose controller is landscape.
 */
export function phoneContextOptions(
  browserName: PhoneBrowser,
  { landscape = false }: { landscape?: boolean } = {},
): BrowserContextOptions {
  if (browserName === 'webkit') {
    return { ...devices[landscape ? 'iPhone 14 landscape' : 'iPhone 14'] };
  }
  if (browserName === 'chromium') {
    return { ...devices[landscape ? 'Pixel 7 landscape' : 'Pixel 7'] };
  }
  const { viewport, deviceScaleFactor } = devices['Pixel 7'];
  const { width, height } = viewport;
  return {
    viewport: landscape ? { width: height, height: width } : { width, height },
    hasTouch: true,
    deviceScaleFactor,
  };
}
