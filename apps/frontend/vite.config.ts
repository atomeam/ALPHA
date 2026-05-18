import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendUrl = process.env['VITE_BACKEND_URL'] || 'http://localhost:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: process.env['DISABLE_HMR'] !== 'true',
    watch: process.env['DISABLE_HMR'] === 'true' ? null : {},
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
});
