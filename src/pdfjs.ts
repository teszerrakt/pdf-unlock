// pdf.js as the page loads it, with its worker and image decoders served from this origin. Imported
// dynamically, and only by the Done screen: the pick and unlock screens never fetch it. The legacy
// build polyfills what Safari before 18.2 lacks (Promise.try), which the rest of the app runs on.
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url'
import { PDFJS_WASM } from './thumbnail'

GlobalWorkerOptions.workerSrc = workerSrc

export { getDocument, PDFJS_WASM as wasmUrl }
