// TV entry (index.html, SPEC §15.1). FF1 stub: a blank page with the brand styles; host wiring
// (FF7) mounts the Phaser canvas and the DOM overlay into #tv.
import { debugEnabled } from '@pcg/game-kit';
import '../styles/brand.css';

// TV UI samples (`?ui=<screen>`, BUILD_PLAN FF5): dev or `?debug=1` only.
const uiScreen = new URLSearchParams(location.search).get('ui');
if (uiScreen && debugEnabled(import.meta.env.DEV)) {
  void import('./ui/dev').then(({ isUiScreen, mountUiDev }) => {
    if (isUiScreen(uiScreen)) mountUiDev(document.getElementById('tv') ?? document.body, uiScreen);
  });
}
