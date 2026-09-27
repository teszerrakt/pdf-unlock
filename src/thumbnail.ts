// Page 1 of the unlocked copy, drawn for the Done card's file icon. Takes pdf.js as an argument:
// `main.ts` loads it only once Done shows, and the unit tests pass Node's build of it.
import type { getDocument } from 'pdfjs-dist'

// Where pdf.js fetches its image decoders from: vite.config.ts ships them there.
export const PDFJS_WASM = '/pdfjs/'

// Twice the file icon's 44 × 54, so the page stays sharp on a 2x screen.
export const box = { width: 88, height: 108 }

// Page 1 fills the icon's width. A page taller than the icon shows its top.
export function fit(page: { width: number; height: number }) {
  const scale = box.width / page.width
  return { scale, height: Math.min(box.height, page.height * scale) }
}

// Sizes `canvas` to page 1 and draws it there. Rejects when pdf.js cannot load or draw the page.
export async function drawPage(pdf: Blob, canvas: HTMLCanvasElement, pdfjs: { getDocument: typeof getDocument }) {
  // A fresh copy of the bytes: pdf.js detaches the buffer it gets.
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), wasmUrl: PDFJS_WASM })
  try {
    const page = await (await task.promise).getPage(1)
    const { scale, height } = fit(page.getViewport({ scale: 1 }))
    canvas.width = box.width
    canvas.height = Math.ceil(height)
    await page.render({ canvas, viewport: page.getViewport({ scale }) }).promise
  } finally {
    await task.destroy()
  }
}

// Copies a drawn page into the icon's canvas. A page shorter than the icon sits centred.
export function place(page: HTMLCanvasElement, icon: HTMLCanvasElement) {
  const context = icon.getContext('2d')!
  context.clearRect(0, 0, icon.width, icon.height)
  context.drawImage(page, 0, Math.floor((icon.height - page.height) / 2))
}
