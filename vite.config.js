import { defineConfig } from 'vite';
import path from 'path';

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
      '@': path.resolve(__dirname, './src')
    }
  }
});
