import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { routePreload } from './build/route-preload-plugin.ts';

export default defineConfig({
  // The router plugin must come before the React plugin.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss(), routePreload()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // The manifest lets the size-limit check compute the first route's chunks (.size-limit.js).
    manifest: true,
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
