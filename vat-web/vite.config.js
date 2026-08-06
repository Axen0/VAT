import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vite configuration for VAT Web.
 * - Alias "shared" points to the monorepo shared folder (CommonJS files are
 *   loaded as side-effect modules and read from window globals).
 * - "global" define is required by WebTorrent browser build.
 * - server.fs.allow opens the parent directory so /@fs/ shared files load.
 */
export default defineConfig({
  resolve: {
    alias: {
      shared: fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: ['..'],
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
  },
});