import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { lockedPdf, plainPdf } from '../test/fixtures'
import { unlock } from './unlock'
import { createQpdf } from '../test/qpdf'
import { box, drawPage, fit, place } from './thumbnail'

// The browser build needs APIs Node 22 lacks; the legacy build is the same renderer.
const pdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs')

const asHtml = (canvas: Canvas) => canvas as unknown as HTMLCanvasElement

// Pixels a page's content drew in rows `from` to `to`: opaque and darker than the white page under it.
function ink(canvas: Canvas, from = 0, to = canvas.height) {
  const { data } = canvas.getContext('2d').getImageData(0, from, canvas.width, to - from)
  let count = 0
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] && data[i] + data[i + 1] + data[i + 2] < 600) count++
  return count
}

async function unlockedCopy() {
  const result = await unlock(createQpdf, await lockedPdf({ openPassword: 'secret' }), [{ password: 'secret', form: null, trimmed: false }])
  if (result.type !== 'unlocked') throw new Error(`the fixture did not unlock: ${result.type}`)
  return result.pdf
}

describe('fitting page 1 into the file icon', () => {
  it('draws at twice the icon’s 44 × 54', () => {
    expect(box).toEqual({ width: 88, height: 108 })
  })

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
    expect(ink(canvas)).toBeGreaterThan(0)
  })

  it('rejects for a file pdf.js cannot read, so the card keeps its “PDF” label', async () => {
    const broken = plainPdf().slice(0, 40)
    await expect(drawPage(new Blob([broken]), asHtml(createCanvas(1, 1)), await pdfjs())).rejects.toThrow()
  })
})

describe('placing the drawn page in the icon', () => {
  it('centres a page shorter than the icon, and clears what the icon showed before', async () => {
    const page = createCanvas(1, 1)
    await drawPage(new Blob([plainPdf() as BlobPart]), asHtml(page), await pdfjs())
    const icon = createCanvas(box.width, box.height)
    const context = icon.getContext('2d')
    context.fillStyle = '#000'
    context.fillRect(0, 0, box.width, box.height)

    place(asHtml(page), asHtml(icon))

    const top = Math.floor((box.height - page.height) / 2)
    expect(ink(icon, 0, top)).toBe(0)
    expect(ink(icon, top + page.height, box.height)).toBe(0)
    expect(ink(icon, top, top + page.height)).toBe(ink(page))
  })
})
