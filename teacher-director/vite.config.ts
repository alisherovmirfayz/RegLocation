import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const backend = process.env.API_UPSTREAM ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/socket.io': { target: backend, ws: true, changeOrigin: false },
    },
  },
});
