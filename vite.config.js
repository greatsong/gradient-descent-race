import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4023,
    proxy: {
      '/api': { target: 'http://localhost:4024', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4024', ws: true, changeOrigin: true },
    },
  },
});
