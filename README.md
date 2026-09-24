# Sphynx: PDF Unlock

A PWA that removes the password from a PDF. It runs entirely in the browser: the file and the
password never leave the device.

## Privacy model

- Unlocking runs [qpdf](https://qpdf.sourceforge.io/) compiled to WebAssembly
  ([`@neslinesli93/qpdf-wasm`](https://github.com/neslinesli93/qpdf-wasm), pinned) in a Web Worker.
- The host only serves static files. There is no API, no upload endpoint, no analytics.
- Each file gets its own worker. The worker is terminated, the password field cleared and the
  output blob URL revoked when you finish or pick another file.
- A strict Content-Security-Policy (`connect-src 'self'`, no third-party origins) stops the page
  from sending data anywhere, even if a dependency tried.
- Nothing is stored. The one exception is an Android share: the service worker parks the shared
  file in Cache Storage for the redirect, and the page deletes it on the next load.
- Do not turn on Vercel Web Analytics or Cloudflare Web Analytics for this project. The CSP would
  block their scripts anyway.

## Getting files in and out

| Platform | In | Out |
| --- | --- | --- |
| iPhone / iPad | File picker (Files, iCloud Drive) | **Save or share** (Save to Files, AirDrop, Mail…) |
| Android | File picker, paste, **Share sheet** after install | Download or **Share** |
| Desktop | File picker, drag and drop, paste, "Open with" after install (Chromium) | Download or **Share** |

Chrome 153 on Android sends share-target POSTs with no files, whatever app shares them
(Chromium bugs 548571656 and 547426657; see
[squoosh#1503](https://github.com/GoogleChromeLabs/squoosh/issues/1503)). The app then shows "did
not pass the shared file". Use the file picker until Chrome ships a fix.

iOS does not let web apps receive files from the share sheet (no Web Share Target support), so on
iPhone the file picker is the way in.

## Develop

```sh
npm install
npm run dev
```

`npm run build` type-checks and writes `dist/`. `npm run preview` serves it; the service worker
only runs in the built app.

## Deploy

Security headers live in two files that must stay in sync: `vercel.json` (Vercel) and
`public/_headers` (Cloudflare).

**Vercel**: import the repo, or run `npx vercel`. `vercel.json` sets the build command, output
directory and headers.

**Cloudflare Workers** (static assets): `npm run deploy:cloudflare`. Uses `wrangler.jsonc`.

**Cloudflare Pages**: build command `npm run build`, output directory `dist`. Or run
`npm run build && npx wrangler pages deploy dist`.

## Art and icons

The cat drawings and the app icon come from the ink originals in `art/` (not committed: about
2 MB each). `scripts/art.mjs` turns them into the masks in `public/art/` and the PWA icons in
`public/`. Run `npm i --no-save sharp && node scripts/art.mjs`.

Keep the originals out of `public/`: everything there is shipped and precached.
