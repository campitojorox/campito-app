import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vite plugin to mock Vercel API locally
const vercelApiMock = () => {
  return {
    name: 'vercel-api-mock',
    configureServer(server) {
      const apiRoutes = {
        '/api/manage-users': './api/manage-users.js',
        '/api/chat-job': './api/chat-job.js',
      };

      for (const [routePath, modulePath] of Object.entries(apiRoutes)) {
        server.middlewares.use(routePath, async (req, res) => {
          if (req.method === 'OPTIONS') {
            res.statusCode = 200;
            res.end();
            return;
          }

          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', async () => {
            try {
              const rawBody = Buffer.concat(chunks).toString('utf8');
              if (rawBody && rawBody.trim()) {
                try {
                  req.body = JSON.parse(rawBody);
                } catch {
                  req.body = rawBody;
                }
              } else {
                req.body = {};
              }

              const urlObj = new URL(req.url || '/', 'http://localhost');
              req.query = Object.fromEntries(urlObj.searchParams.entries());

              const env = loadEnv('development', process.cwd(), '');
              Object.assign(process.env, env);

              res.status = (code) => {
                res.statusCode = code;
                return res;
              };
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
              };

              const handlerModule = await import(modulePath);
              await handlerModule.default(req, res);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        });
      }
    }
  };
};

export default defineConfig({
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    }
  },
  plugins: [
    react(),
    vercelApiMock(),
    VitePWA({
      registerType: 'prompt',
      devOptions: {
        enabled: false
      },
      includeAssets: ['icon-192x192.png', 'icon-512x512.png'],
      manifest: {
        name: 'Campito Jorox',
        short_name: 'Campito',
        description: 'Gestión de calendario y contabilidad para Campito Jorox',
        theme_color: '#2a9d8f',
        background_color: '#f8f9fa',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})
