// Regenerate the cat masks and app icons from the ink drawings in art/.
// sharp is not a dependency: run `npm i --no-save sharp && node scripts/art.mjs`.
import sharp from 'sharp'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'

const INK = '#8C5E24'
const TILE = '#F5EFE4'

// Ink becomes opaque black, white paper becomes transparent; the page tints it with mask-image.
async function inkMask(src) {
  const { data, info } = await sharp(src).flatten({ background: '#fff' }).greyscale().extractChannel(0).raw()
    .toBuffer({ resolveWithObject: true })
  const px = Buffer.alloc(info.width * info.height * 4)
  for (let p = 0; p < data.length; p++) px[p * 4 + 3] = Math.max(0, Math.min(255, Math.round((250 - data[p]) * 1.08)))
  const raw = { raw: { width: info.width, height: info.height, channels: 4 } }
  return sharp(await sharp(px, raw).trim({ threshold: 1 }).png().toBuffer())
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 }

async function catMask(src, out, size) {
  const img = (await inkMask(src)).resize(size, size, { fit: 'contain', background: transparent })
  await img.webp({ quality: 80, alphaQuality: 65, effort: 6 }).toFile(out)
  console.log(out, `${Math.round(statSync(out).size / 1024)} KB`)
}

// The icon drawing in INK, `fill` of a square `size` canvas, centred on `bg`.
async function icon(size, { fill, bg = TILE, radius = 0, safeCircle = 0 }) {
  const mask = await inkMask('art/sphynx-icon.png')
  let inner = Math.round(size * fill)
  if (safeCircle) inner = await fitCircle(mask, size, safeCircle)
  const alpha = await mask.clone().resize(inner, inner, { fit: 'contain', background: transparent })
    .extractChannel(3).toBuffer()
  const ink = await sharp({ create: { width: inner, height: inner, channels: 3, background: INK } })
    .joinChannel(alpha).png().toBuffer()
  const tile = radius
    ? Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * radius}" fill="${bg}"/></svg>`)
    : null
  const base = sharp({ create: { width: size, height: size, channels: 4, background: tile ? transparent : bg } })
  const offset = Math.round((size - inner) / 2)
  return base.composite([...(tile ? [{ input: tile }] : []), { input: ink, left: offset, top: offset }]).png()
}

// Largest drawing size whose farthest ink pixel stays inside a centred circle of `ratio` * size diameter.
async function fitCircle(mask, size, ratio) {
  const probe = 400
  const { data } = await mask.clone().resize(probe, probe, { fit: 'contain', background: transparent })
    .extractChannel(3).raw().toBuffer({ resolveWithObject: true })
  let far = 0
  for (let p = 0; p < data.length; p++) {
    if (data[p] < 32) continue
    const x = (p % probe) + 0.5 - probe / 2, y = Math.floor(p / probe) + 0.5 - probe / 2
    far = Math.max(far, Math.hypot(x, y))
  }
  return Math.floor((size * ratio) / 2 / (far / probe))
}

// ICO holding one PNG image (supported by every current browser).
function ico(png, size) {
  const head = Buffer.alloc(22)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(1, 4)
  head.writeUInt8(size % 256, 6)
  head.writeUInt8(size % 256, 7)
  head.writeUInt16LE(1, 10)
  head.writeUInt16LE(32, 12)
  head.writeUInt32LE(png.length, 14)
  head.writeUInt32LE(22, 18)
  return Buffer.concat([head, png])
}

mkdirSync('public/art', { recursive: true })
for (const i of [1, 2, 3, 4, 5]) await catMask(`art/image-${i}.png`, `public/art/cat-${i}.webp`, 640)
await catMask('art/sphynx-icon.png', 'public/art/mark.webp', 160)

await (await icon(64, { fill: 0.9, radius: 0.225 })).toFile('public/pwa-64x64.png')
await (await icon(192, { fill: 0.88, radius: 0.225 })).toFile('public/pwa-192x192.png')
await (await icon(512, { fill: 0.88, radius: 0.225 })).toFile('public/pwa-512x512.png')
await (await icon(180, { fill: 0.84 })).toFile('public/apple-touch-icon-180x180.png')
await (await icon(512, { safeCircle: 0.8 })).toFile('public/maskable-icon-512x512.png')
writeFileSync('public/favicon.ico', ico(await (await icon(48, { fill: 0.94, radius: 0.2 })).toBuffer(), 48))
console.log('icons written')
