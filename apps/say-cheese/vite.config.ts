// Two entries (PLATFORM §4, SPEC §4): index.html is the TV host, play.html the phone controller.
import { fileURLToPath } from 'node:url';
import { lanUrl, playRoute } from '@pcg/game-kit/vite';
import { defineConfig } from 'vite';

const fromRoot = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [playRoute(), lanUrl()],
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  build: {
    manifest: true,
    rolldownOptions: {
      input: {
        host: fromRoot('./index.html'),
        controller: fromRoot('./play.html'),
      },
    },
  },
});
