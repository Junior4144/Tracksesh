import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * The SPA build lands in the API's wwwroot.
 *
 * That is what makes the deployed app a single process: `dotnet publish` picks
 * up whatever is in wwwroot, and Program.cs serves it with a fallback to
 * index.html so client-side routes survive a cold load. There is no second
 * server to deploy and no origin split in production.
 */
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },

  build: {
    outDir: 'server/Tracksesh.Api/wwwroot',
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    proxy: {
      /*
       * Dev requests to /api go to the API process, so the browser still sees a
       * single origin and CORS never enters the picture — the same shape as
       * production, which is the point. `secure: false` because the API's HTTPS
       * profile uses the ASP.NET development certificate.
       */
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5251',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
