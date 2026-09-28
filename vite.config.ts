import { defineConfig } from 'vite'

// The Node server (server/index.ts) mounts Vite in middleware mode during
// development and serves dist/ in production, so this config only needs to
// describe the client build. The proxy is a courtesy for anyone running
// `vite` on its own.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  worker: {
    format: 'es',
  },
})
