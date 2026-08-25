import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration.
 *
 * The dev server binds to **localhost only**. That is not a convenience: W5-A
 * permits development authentication solely against a localhost origin, and a
 * server listening on 0.0.0.0 would put a self-asserted-identity UI on the
 * network. `strictPort` so the origin the user is told about is the origin they
 * get.
 *
 * `/api` is proxied to the ASDP service so the browser has ONE origin and no
 * CORS configuration exists to be loosened later.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.ASDP_API_URL ?? 'http://127.0.0.1:3000',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: { outDir: 'dist-web', emptyOutDir: true },
});
