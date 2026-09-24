import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { SHARE_ACTION } from './src/share-target.ts'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  worker: { format: 'es' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  // Phones reach the dev server through `tailscale serve`, which forwards the ts.net Host header.
  server: { allowedHosts: ['.ts.net'] },
  preview: { allowedHosts: ['.ts.net'] },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'script',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,wasm,svg,png,ico,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'Sphynx: PDF Unlock',
        short_name: 'Sphynx',
        description: 'Remove the password from a PDF. Runs entirely on your device.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f5efe4',
        theme_color: '#f5efe4',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: SHARE_ACTION,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['application/pdf', '.pdf'] }] },
        },
        file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] } }],
      },
    }),
  ],
})
