import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite configuration.
 *
 * NOTE: only `VITE_` prefixed variables are ever exposed to the browser bundle.
 * Service-role keys / secrets must never be added to this file or to `define`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // Only rewrite the `@/...` path prefix so scoped npm packages
      // (eg. `@supabase/supabase-js`) keep resolving normally.
      { find: /^@\//, replacement: '/src/' },
    ],
  },
  server: {
    port: 5173,
    // Sensible dev-only hardening mirroring the production headers.
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    },
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    // Keep the main entry small: React + Supabase ship as separate cached chunks.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          ui: ['lucide-react', 'clsx'],
        },
      },
    },
  },
});