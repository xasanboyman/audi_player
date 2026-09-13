import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
      '/tracks': 'http://localhost:3001',
      '/models': 'http://localhost:3001',
      '/motions': 'http://localhost:3001',
      '/mocap': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001'
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@pixiv/three-vrm')) {
            return 'vendor-vrm';
          }
          if (id.includes('three/examples/')) {
            return 'vendor-three-addons';
          }
          if (id.includes('three')) {
            return 'vendor-three-core';
          }
        }
      }
    }
  }
});
