// Add-to-Home-Screen sheet (controller-compat F0 contract, F3 builds it): what the full-screen button
// opens where the Fullscreen API is missing. A short modal card (`.pcg-sheet` > `.pcg-sheet-card`
// with h2, p and a close button) the game styles; closes on its button, on a tap outside the card,
// and on Escape. Layout-only inline styles: the kit ships no look.
// Frozen at controller-compat F0: additive changes only.

export interface InstallSheetText {
  title: string;
  body: string;
  close: string;
}

/** Opens the sheet in `host`; returns a close function (safe to call twice). */
export function openInstallSheet(host: HTMLElement, text: InstallSheetText): () => void {
  const doc = host.ownerDocument;
  const sheet = doc.createElement('div');
  sheet.className = 'pcg-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  Object.assign(sheet.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding:
      'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
  });
  const card = doc.createElement('div');
  card.className = 'pcg-sheet-card';
  card.style.maxWidth = 'min(100%, 420px)';
  const h2 = doc.createElement('h2');
  h2.textContent = text.title;
  const p = doc.createElement('p');
  p.textContent = text.body;
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = text.close;
  btn.style.minHeight = '44px';
  card.append(h2, p, btn);
  sheet.append(card);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    doc.removeEventListener('keydown', onKey, true);
    sheet.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  btn.addEventListener('click', close);
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });
  doc.addEventListener('keydown', onKey, true);
  host.append(sheet);
  btn.focus();
  return close;
}
