import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react({ include: /\.(jsx|js)$/ }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,json,woff2}'],
      },
    }),
    {
      name: 'universal-local-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/api/rss-proxy') && !req.url?.startsWith('/api/proxy')) {
            return next();
          }
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            return res.end();
          }
          try {
            const reqUrl = new URL(req.url, 'http://localhost');
            const target = reqUrl.searchParams.get('url');
            if (!target) {
              res.statusCode = 400;
              return res.end('Missing url query parameter');
            }
            const upstream = await fetch(target, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/xml, application/xml, application/rss+xml, application/atom+xml, text/html, application/json, */*',
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
              },
              signal: AbortSignal.timeout(15000)
            });
            res.statusCode = upstream.status;
            const rawCt = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
            res.setHeader('Content-Type', rawCt.replace(/,\s*charset=/i, '; charset='));
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            const buf = await upstream.arrayBuffer();
            res.end(Buffer.from(buf));
          } catch (err) {
            res.statusCode = 502;
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(err.message || 'Upstream fetch error');
          }
        });
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    cssCodeSplit: false,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/storage',
      '@nozbe/watermelondb',
      '@nozbe/watermelondb/DatabaseProvider',
      '@nozbe/watermelondb/adapters/lokijs',
      'lucide-react',
      'framer-motion',
      'chart.js',
      'react-chartjs-2',
      'react-markdown',
      'remark-gfm',
    ],
    esbuildOptions: { loader: { '.js': 'jsx' } },
  },
})
