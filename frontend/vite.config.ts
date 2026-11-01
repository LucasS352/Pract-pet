import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// ============================================================
//  Vite + React + PWA Config — PDV Pro
//  Substitui next.config.ts na migração para Vite
// ============================================================

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      // 'autoUpdate' instala e ativa o novo SW imediatamente sem prompt
      registerType: 'autoUpdate',

      // O service worker é gerado pelo Workbox; autoUpdate controla a ativação.
      strategies: 'generateSW',

      // Ponto de entrada do manifest
      manifest: {
        name: 'Pract Pet',
        short_name: 'Pract Pet',
        description: 'Gestão completa para Pet Shop, Banho e Tosa, Clínica e Caixa.',
        theme_color: '#0B0F14',
        background_color: '#0B0F14',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['business', 'productivity'],
      },

      // ── Workbox — Estratégias de Cache ──────────────────────────────────────
      workbox: {
        // Pré-cacheia todos os assets do build (JS, CSS, HTML)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Sem limite de tamanho para o precache (bundle pode ser grande)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB

        runtimeCaching: [
          // Product images have immutable IDs. Keep their cache separate from JSON.
          // 300 entries x 200 KiB bounds stored payload to ~59 MiB (plus overhead).
          // Old multi-megabyte originals are never added to this dedicated SW cache.
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/api\/products\/uploads\/images\/[^/]+$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdvpro-product-images-v1',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              plugins: [{
                cacheWillUpdate: async ({ response }) => {
                  const size = Number(response.headers.get('content-length'));
                  return response.status === 200 && size > 0 && size <= 200 * 1024 ? response : null;
                },
              }],
            },
          },
          // ── Network First: Catálogo de Produtos ─────────────────────────
          // Tenta a rede primeiro; se falhar, serve do cache.
          // NOTA: /api/cash-registers NÃO deve ser interceptado pelo Workbox de forma transparente
          // para evitar que um snapshot antigo seja confundido com confirmação em tempo real pelo servidor.
          // O fallback offline do caixa é gerenciado de forma determinística pelo ShiftContext via localStorage.
          {
            urlPattern: ({ url }) =>
              (url.pathname === '/api/products' || url.pathname.startsWith('/api/products/')) &&
              !url.pathname.startsWith('/api/products/uploads/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pdvpro-api-critical',
              networkTimeoutSeconds: 5, // timeout antes de cair pro cache
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24, // 24h
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },

        // ── Stale-While-Revalidate: fontes (NÃO scripts — o precache já versiona JS)
          {
            urlPattern: ({ request }) =>
              request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'pdvpro-styles',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 dias
              },
            },
          },

          // ── Cache First: Fontes e imagens ─────────────────────────────────
          {
            urlPattern: ({ request }) =>
              request.destination === 'image' ||
              request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdvpro-assets',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],

  resolve: {
    alias: {
      // Mantém o alias @/ usado em todo o código existente
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 3531,
    // Proxy: redireciona /api/* para o backend NestJS em localhost:3520
    proxy: {
      '/api': {
        target: 'http://localhost:3530',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3530',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) exige manualChunks como função, não objeto
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('/react/')) return 'vendor';
          if (id.includes('zustand'))           return 'store';
          if (id.includes('lucide-react') || id.includes('framer-motion')) return 'ui';
          if (id.includes('dexie'))             return 'db';
          return undefined;
        },
      },
    },
  },
});
