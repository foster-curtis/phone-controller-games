// Add-to-Home-Screen sheet (controller-compat F0 contract, F3 builds it): what the full-screen button
// opens where the Fullscreen API is missing. A short modal card (`.pcg-sheet` > `.pcg-sheet-card`
// with h2, p and a close button) the game styles; closes on its button, on a tap outside the card,
// and on Escape. Frozen at controller-compat F0: additive changes only.

export interface InstallSheetText {
  title: string;
  body: string;
  close: string;
}

/** Opens the sheet in `host`; returns a close function. F3 implements; F0 stub: no-op. */
export function openInstallSheet(_host: HTMLElement, _text: InstallSheetText): () => void {
  return () => {};
}
