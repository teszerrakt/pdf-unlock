import type { Page } from '@playwright/test'

// pdf.js's two scripts in the build: the chunk the Done screen imports, and its worker.
export const pdfjsScript = /\/assets\/pdf(js|\.worker)[^/]*\.js$/
export const pdfjsChunk = /\/assets\/pdfjs-[^/]*\.js$/

export const doneIcon = (page: Page) => page.locator('#done-icon')

// Pixels page 1 drew in the Done card's file icon: opaque and darker than a white page.
export function thumbnailInk(page: Page) {
  return page.locator('#done-thumb').evaluate((canvas: HTMLCanvasElement) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    let count = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] && data[i] + data[i + 1] + data[i + 2] < 600) count++
    return count
  })
}
