import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { lockedPdf, plainPdf, scannedPdf } from '../test/fixtures'
import { ink } from '../test/ink'
import { unlock } from './unlock'
import { createQpdf } from '../test/qpdf'
import { box, drawPage, fit, place } from './thumbnail'

// The browser build needs APIs Node 22 lacks; the legacy build is the same renderer. In Node, pdf.js
// reads its image decoders from the file system.
const pdfjs = async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), wasmUrl: 'node_modules/pdfjs-dist/wasm/' })

const asHtml = (canvas: Canvas) => canvas as unknown as HTMLCanvasElement

const inkIn = (canvas: Canvas, from = 0, to = canvas.height) => ink(canvas.getContext('2d').getImageData(0, from, canvas.width, to - from).data)

async function unlockedCopy() {
  const result = await unlock(createQpdf, await lockedPdf({ openPassword: 'secret' }), [{ password: 'secret', form: null, trimmed: false }])
  if (result.type !== 'unlocked') throw new Error(`the fixture did not unlock: ${result.type}`)
  return result.pdf
}

describe('fitting page 1 into the file icon', () => {
  it('fills the width of a portrait page and shows its top when it is taller than the icon', () => {
    // A4 in points.
    expect(fit({ width: 595, height: 842 })).toEqual({ scale: 88 / 595, height: 108 })
  })

  it('fills the width of a landscape page, leaving it shorter than the icon', () => {
    expect(fit({ width: 300, height: 144 })).toEqual({ scale: 88 / 300, height: 42.24 })
  })
})

describe('drawing page 1 of the unlocked copy', () => {
  it('draws the page’s content onto the canvas, sized to fit', async () => {
    const canvas = createCanvas(1, 1)
    await drawPage(new Blob([(await unlockedCopy()) as BlobPart]), asHtml(canvas), await pdfjs())
    expect(canvas.width).toBe(88)
    expect(canvas.height).toBe(Math.ceil(fit({ width: 300, height: 144 }).height))
    expect(inkIn(canvas)).toBeGreaterThan(0)
  })

  it('draws a black-and-white scan, whose image only pdf.js’s wasm decoder reads', async () => {
    const canvas = createCanvas(1, 1)
    await drawPage(new Blob([(await scannedPdf()) as BlobPart]), asHtml(canvas), await pdfjs())
    expect(inkIn(canvas)).toBeGreaterThan(1000)
  })

  it('rejects for a file pdf.js cannot read, so the card keeps its “PDF” label', async () => {
    const broken = plainPdf().slice(0, 40)
    await expect(drawPage(new Blob([broken]), asHtml(createCanvas(1, 1)), await pdfjs())).rejects.toThrow()
  })
})

describe('placing the drawn page in the icon', () => {
  it('sizes the icon to twice its 44 × 54, centres a shorter page, and clears what it showed before', async () => {
    const page = createCanvas(1, 1)
    await drawPage(new Blob([plainPdf() as BlobPart]), asHtml(page), await pdfjs())
    const icon = createCanvas(box.width, box.height)
    const context = icon.getContext('2d')
    context.fillStyle = '#000'
    context.fillRect(0, 0, box.width, box.height)

    place(asHtml(page), asHtml(icon))

    expect([icon.width, icon.height]).toEqual([88, 108])

    const top = Math.floor((box.height - page.height) / 2)
    expect(inkIn(icon, 0, top)).toBe(0)
    expect(inkIn(icon, top + page.height, box.height)).toBe(0)
    expect(inkIn(icon, top, top + page.height)).toBe(inkIn(page))
  })
})
