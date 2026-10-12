import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const backend = process.env.BACKEND_URL ?? 'http://localhost:8080';

export default defineConfig({
  root,
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL('../dist/monitor', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/socket.io': { target: backend, ws: true, changeOrigin: false },
    },
  },
});
