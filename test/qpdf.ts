// qpdf-wasm in Node: the same build the app ships, loaded from bytes instead of a URL.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import createModule from '@neslinesli93/qpdf-wasm'
import type { CreateQpdf, Qpdf } from '../src/unlock'

const wasmBinary = readFileSync(createRequire(import.meta.url).resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'))

// The package's types only know locateFile; the Emscripten loader also takes the wasm bytes.
const load = createModule as unknown as (options: { wasmBinary: Uint8Array }) => Promise<Qpdf>

export const createQpdf: CreateQpdf = () => load({ wasmBinary })

// Runs qpdf once on `input` and returns its exit code and /out.pdf, for building and checking fixtures.
export async function qpdf(input: Uint8Array, args: string[]) {
  const original = console.error
  console.error = () => {}
  let q: Qpdf
  try {
    q = await createQpdf()
  } finally {
    console.error = original
  }
  q.FS.writeFile('/in.pdf', input)
  const code = q.callMain(args)
  const output = args.includes('/out.pdf') && (code === 0 || code === 3) ? q.FS.readFile('/out.pdf') : undefined
  return { code, output }
}

// qpdf --is-encrypted: 0 when locked, 2 when not.
export async function isLocked(pdf: Uint8Array) {
  return (await qpdf(pdf, ['--is-encrypted', '/in.pdf'])).code === 0
}
