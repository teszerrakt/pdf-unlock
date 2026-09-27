// pdf.js as the page loads it, with its worker served from this origin. Imported dynamically, and
// only by the Done screen: the pick and unlock screens never fetch it.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'

GlobalWorkerOptions.workerSrc = workerSrc

export { getDocument }
