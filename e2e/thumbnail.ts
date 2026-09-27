import type { Page } from '@playwright/test'
import { ink } from '../test/ink.ts'

// pdf.js's two scripts in the build: the chunk the Done screen imports, and its worker.
export const pdfjsScript = /\/assets\/pdf(js|\.worker)[^/]*\.js$/
export const pdfjsChunk = /\/assets\/pdfjs-[^/]*\.js$/
export const pdfjsWorker = /\/assets\/pdf\.worker[^/]*\.js$/

export const doneIcon = (page: Page) => page.locator('#done-icon')

// Pixels page 1 drew in the Done card's file icon.
export async function thumbnailInk(page: Page) {
  return ink(
    await page.locator('#done-thumb').evaluate((canvas: HTMLCanvasElement) => [
      ...canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data,
    ]),
  )
}
