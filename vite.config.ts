import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { PDFJS_WASM } from './src/thumbnail.ts'
import { SHARE_ACTION } from './src/share-target.ts'
import pkg from './package.json' with { type: 'json' }
import vercel from './vercel.json' with { type: 'json' }

// `vite preview` sends the production headers from vercel.json, so e2e runs under the real CSP.
// Not in dev: the CSP would block Vite's injected scripts.
function productionHeaders(): Plugin {
  const rules = vercel.headers.map(({ source, headers }) => ({ pattern: new RegExp(`^${source}$`), headers }))
  return {
    name: 'production-headers',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname
        for (const { pattern, headers } of rules) {
          if (pattern.test(path)) for (const { key, value } of headers) res.setHeader(key, value)
        }
        next()
      })
    },
  }
}

// pdf.js fetches its image decoders by file name from one folder, so they ship unhashed under it.
// jbig2.wasm decodes black-and-white scans (JBIG2 and CCITT fax), openjpeg.wasm JPEG 2000, qcms ICC colour.
function pdfjsWasm(): Plugin {
  const files = ['jbig2.wasm', 'openjpeg.wasm', 'qcms_bg.wasm']
  const read = (file: string) => readFileSync(new URL(`node_modules/pdfjs-dist/wasm/${file}`, import.meta.url))
  return {
    name: 'pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use(PDFJS_WASM, (req, res, next) => {
        const file = files.find((name) => req.url === `/${name}`)
        if (!file) return next()
        res.setHeader('Content-Type', 'application/wasm')
        res.end(read(file))
      })
    },
    generateBundle() {
      for (const file of files) this.emitFile({ type: 'asset', fileName: `${PDFJS_WASM.slice(1)}${file}`, source: read(file) })
    },
  }
}

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
    productionHeaders(),
    pdfjsWasm(),
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
