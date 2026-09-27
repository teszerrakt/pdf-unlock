// Page 1 of the unlocked copy, drawn for the Done card's file icon. Takes pdf.js as an argument:
// `main.ts` loads it only once Done shows, and the unit tests pass Node's build of it. `wasmUrl` is the
// folder pdf.js reads its image decoders from.
import type { getDocument } from 'pdfjs-dist'

// Where the page's pdf.js fetches its image decoders from: vite.config.ts ships them there.
export const PDFJS_WASM = '/pdfjs/'

// Twice the file icon's 44 × 54, so the page stays sharp on a 2x screen.
export const box = { width: 88, height: 108 }

export function fit(page: { width: number; height: number }) {
  const scale = box.width / page.width
  return { scale, height: Math.min(box.height, page.height * scale) }
}

export async function drawPage(pdf: Blob, canvas: HTMLCanvasElement, pdfjs: { getDocument: typeof getDocument; wasmUrl: string }) {
  // A fresh copy of the bytes: pdf.js detaches the buffer it gets.
  const task = pdfjs.getDocument({ data: new Uint8Array(await pdf.arrayBuffer()), wasmUrl: pdfjs.wasmUrl })
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

// Sizing the icon's canvas also clears the page it showed before.
export function place(page: HTMLCanvasElement, icon: HTMLCanvasElement) {
  icon.width = box.width
  icon.height = box.height
  icon.getContext('2d')!.drawImage(page, 0, Math.floor((box.height - page.height) / 2))
}
