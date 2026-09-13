import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/Star_System_Planner/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'es',
  },
  preview: {
    allowedHosts: ['.e2b.app', 'localhost'],
  },
  plugins: [
    react(),
    VitePWA({
      // BACK14: prompt-mode updates (user-visible reload) + offline fallback.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg', 'pwa-192x192.svg', 'pwa-512x512.svg', 'offline.html'],
      workbox: {
        navigateFallback: '/Star_System_Planner/offline.html',
      },
      manifest: {
        name: 'Starsilk System Planner',
        short_name: 'Starsilk Planner',
        description: 'Tactile 3D stellar-architecture laboratory for galaxy builders',
        theme_color: '#03050a',
        background_color: '#03050a',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          {
            src: 'pwa-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
