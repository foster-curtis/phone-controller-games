// One static page (SPEC: Build and hosting): index.html, prerendered from @pcg/catalog at build time.
import { catalogCheck } from '@pcg/catalog/vite';
import { defineConfig } from 'vite';
import { prerenderGallery } from './src/build/prerender.ts';

export default defineConfig({
  plugins: [prerenderGallery(), catalogCheck()],
  server: { port: 5173 },
  preview: { port: 4173 },
});
