import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.PAGES_BASE_PATH || './',
  server: { port: 8768, strictPort: true },
  preview: { port: 8769, strictPort: true },
  build: { sourcemap: true },
});
