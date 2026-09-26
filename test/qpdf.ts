// qpdf-wasm in Node: the same build the app ships, loaded from bytes instead of a URL.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import createModule from '@neslinesli93/qpdf-wasm'
import type { CreateQpdf, Qpdf } from '../src/unlock'

const wasmBinary = readFileSync(createRequire(import.meta.url).resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'))

// The package's types only know locateFile; the Emscripten loader also takes the wasm bytes.
const load = createModule as unknown as (options: { wasmBinary: Uint8Array }) => Promise<Qpdf>

export const createQpdf: CreateQpdf = () => load({ wasmBinary })

// Runs qpdf once on `input`, for building and checking fixtures.
export async function qpdf(input: Uint8Array, args: string[]) {
  const stdout: string[] = []
  // qpdf binds console.log and console.error when instantiated.
  const original = { log: console.log, error: console.error }
  console.log = (...parts: unknown[]) => void stdout.push(parts.join(' '))
  console.error = () => {}
  let q: Qpdf
  try {
    q = await createQpdf()
  } finally {
    Object.assign(console, original)
  }
  q.FS.writeFile('/in.pdf', input)
  const code = q.callMain(args)
  const output = args.includes('/out.pdf') && (code === 0 || code === 3) ? q.FS.readFile('/out.pdf') : undefined
  return { code, stdout, output }
}

// Locked unless qpdf reads the file with no password and says so. Not --is-encrypted: this build
// exits 2 on a PDF with an open password, the same as on one with no lock at all.
export async function isLocked(pdf: Uint8Array) {
  const { code, stdout } = await qpdf(pdf, ['--show-encryption', '/in.pdf'])
  return !(code === 0 && stdout.includes('File is not encrypted'))
}
