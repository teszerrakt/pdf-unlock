// pdf.js as the page loads it, with its worker and image decoders served from this origin. Imported
// dynamically, and only by the Done screen: the pick and unlock screens never fetch it.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&url'
import { PDFJS_WASM } from './thumbnail'

GlobalWorkerOptions.workerSrc = workerSrc

export { getDocument, PDFJS_WASM as wasmUrl }
