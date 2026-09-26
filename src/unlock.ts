// Decides what a file is and removes its lock, using qpdf. Knows nothing about workers or the page,
// so tests run it in Node against the real wasm build.

export type Qpdf = {
  callMain(args: string[]): number
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array }
}

import type { Candidate, Form } from './dates'

// Loads a fresh qpdf instance. The browser passes the wasm URL, Node passes the wasm bytes.
export type CreateQpdf = () => Promise<Qpdf>

// How an attempt ends (see CONTEXT.md).
export type Outcome =
  // `password`: the candidate that worked, `form` its date form (null for the exact text).
  | { type: 'unlocked'; pdf: Uint8Array; hadPassword: boolean; password: string | null; form: Form | null }
  | { type: 'not-locked' }
  | { type: 'unreadable'; message: string }

// The attempt pauses at the password prompt, marked wrong or not.
export type Prompt = { type: 'needs-password' } | { type: 'wrong-password' }

// This wasm build reports a missing or wrong password only through stderr (exit code 2 either way).
const isPasswordError = (message: string) => /invalid password/i.test(message)

// A fresh instance per run: qpdf cannot be re-entered after it throws, and no memory outlives the run.
async function run(create: CreateQpdf, input: Uint8Array, args: string[]) {
  const stderr: string[] = []
  // qpdf binds console.error when instantiated, so swapping it in for that moment routes its stderr here.
  const original = console.error
  console.error = (...parts: unknown[]) => void stderr.push(parts.join(' '))
  let q: Qpdf
  try {
    q = await create()
  } finally {
    console.error = original
  }
  q.FS.writeFile('/in.pdf', input)
  const code = q.callMain(args)
  const ok = code === 0 || code === 3 // 3 = succeeded with warnings
  const errors = stderr.filter((line) => !line.includes('WARNING')).join('\n')
  const output = ok && args.includes('/out.pdf') ? q.FS.readFile('/out.pdf') : undefined
  return { code, errors, output }
}

// Opens a file. A restricted PDF has no password prompt, so it is unlocked straight away;
// `onRestricted` fires first so the page can show progress.
export async function open(create: CreateQpdf, input: Uint8Array, onRestricted?: () => void): Promise<Outcome | Prompt> {
  const { code, errors } = await run(create, input, ['--is-encrypted', '/in.pdf'])
  if (code === 0) {
    onRestricted?.()
    return unlock(create, input, null)
  }
  if (isPasswordError(errors)) return { type: 'needs-password' }
  if (code === 2 && !errors) return { type: 'not-locked' }
  return unreadable(errors)
}

// Lossless flags only: see Repack in CONTEXT.md.
const repack = ['--object-streams=generate', '--recompress-flate', '--compression-level=9']

// Removes the lock with the first candidate that opens the PDF, trying them in order, or with no
// password for a restricted PDF. `onTry(n, of)` fires before each candidate after the first.
export async function unlock(
  create: CreateQpdf,
  input: Uint8Array,
  candidates: Candidate[] | null,
  onTry?: (n: number, of: number) => void,
): Promise<Outcome | Prompt> {
  if (!candidates) return decryptWith(create, input, null)
  for (const [i, { password, form }] of candidates.entries()) {
    if (i > 0) onTry?.(i + 1, candidates.length)
    const result = await decryptWith(create, input, password)
    if (result.type === 'unlocked') return { ...result, form }
    if (result.type !== 'wrong-password') return result
  }
  return { type: 'wrong-password' }
}

async function decryptWith(create: CreateQpdf, input: Uint8Array, password: string | null): Promise<Outcome | Prompt> {
  const args = password === null ? [] : [`--password=${password}`]
  const decrypt = (extra: string[] = []) => run(create, input, [...args, '--decrypt', ...extra, '/in.pdf', '/out.pdf'])
  // A repack run that throws (a wasm abort, such as running out of memory) counts as failed.
  let { errors, output } = await decrypt(repack).catch(() => ({ errors: '', output: undefined }))
  // --recompress-flate drops PNG predictors, which can grow an image several times over while the
  // rest of the file shrinks. So the plain decrypt always runs too, and the smaller copy wins. That
  // run failing, even running out of memory, still leaves the repacked copy.
  if (output) {
    const plain = await decrypt().then(({ output }) => output, () => undefined)
    if (plain && plain.length < output.length) output = plain
  }
  // A file the repack run fails on gets the plain decrypt; a wrong password would fail that too.
  else if (!isPasswordError(errors)) ({ errors, output } = await decrypt())
  if (output) return { type: 'unlocked', pdf: output, hadPassword: password !== null, password, form: null }
  if (isPasswordError(errors)) return { type: password === null ? 'needs-password' : 'wrong-password' }
  return unreadable(errors)
}

// qpdf prefixes messages with "<program>: /in.pdf: ".
function unreadable(errors: string): Outcome {
  const detail = errors.split('\n')[0]?.replace(/^.*?\/in\.pdf:\s*/, '').trim()
  const message = detail ? `This file could not be read as a PDF (${detail}).` : 'This file could not be read as a PDF.'
  return { type: 'unreadable', message }
}
