// Phone entry (play.html, SPEC §4, §6.7). `?dev=1` runs the offline harness (dev.ts); otherwise the app
// mounts on a local client with a fake camera until SC5 wires the relay client and the real camera.
// Never imports host code (lint).
import { createLocalClient, isDevMode } from '@pcg/controller-kit';
import '../styles/brand.css';
import '../styles/base.css';
import '../styles/controller.css';
import { createApp } from './app';
import { createFakeCamera } from './fakeCamera';

const root = document.getElementById('app') ?? document.body;

if (isDevMode()) {
  void import('./dev').then((m) => m.startDev(root));
} else {
  // SC5: replace with createControllerClient + the real camera.
  createApp({ root, client: createLocalClient(), camera: createFakeCamera() });
}
