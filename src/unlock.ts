// Decides what a file is and removes its lock, using qpdf. Knows nothing about workers or the page,
// so tests run it in Node against the real wasm build.

export type Qpdf = {
  callMain(args: string[]): number
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array }
}

import type { Candidate, Form } from './dates'

// Loads a fresh qpdf instance. The browser passes the wasm URL, Node passes the wasm bytes.
export type CreateQpdf = () => Promise<Qpdf>

// The restrictions Sphynx names.
export type Restriction = 'print' | 'copy' | 'edit'

// How an attempt ends (see CONTEXT.md).
export type Outcome =
  | {
      type: 'unlocked'
      pdf: Uint8Array
      hadPassword: boolean
      password: string | null
      form: Form | null
      trimmed: boolean
      pages: number | null
      removed: Restriction[]
    }
  | { type: 'not-locked' }
  | { type: 'unreadable'; message: string }

// The attempt pauses at the password prompt, marked wrong or not.
export type Prompt = { type: 'needs-password' } | { type: 'wrong-password' }

// This wasm build reports a missing or wrong password only through stderr (exit code 2 either way).
const isPasswordError = (message: string) => /invalid password/i.test(message)

// A fresh instance per run: qpdf cannot be re-entered after it throws, and no memory outlives the run.
async function run(create: CreateQpdf, input: Uint8Array, args: string[]) {
  const stdout: string[] = []
  const stderr: string[] = []
  // qpdf binds console.log and console.error when instantiated, so swapping them in for that moment
  // routes its stdout and stderr here.
  const original = { log: console.log, error: console.error }
  console.log = (...parts: unknown[]) => void stdout.push(parts.join(' '))
  console.error = (...parts: unknown[]) => void stderr.push(parts.join(' '))
  let q: Qpdf
  try {
    q = await create()
  } finally {
    Object.assign(console, original)
  }
  q.FS.writeFile('/in.pdf', input)
  const code = q.callMain(args)
  const ok = code === 0 || code === 3 // 3 = succeeded with warnings
  const errors = stderr.filter((line) => !line.includes('WARNING')).join('\n')
  const output = ok && args.includes('/out.pdf') ? q.FS.readFile('/out.pdf') : undefined
  return { code, ok, errors, output, stdout: stdout.join('\n') }
}

// Opens a file. A restricted PDF has no password prompt, so it is unlocked straight away;
// `onRestricted` fires first so the page can show progress.
export async function open(create: CreateQpdf, input: Uint8Array, onRestricted?: () => void): Promise<Outcome | Prompt> {
  const { code, errors } = await run(create, input, ['--is-encrypted', '/in.pdf'])
  if (code === 0) {
    onRestricted?.()
    return decryptWith(create, input, null)
  }
  if (isPasswordError(errors)) return { type: 'needs-password' }
  if (code === 2 && !errors) return { type: 'not-locked' }
  return unreadable(errors)
}

// Lossless flags only: see Repack in CONTEXT.md.
const repack = ['--object-streams=generate', '--recompress-flate', '--compression-level=9']

// Removes the lock with the first candidate that opens the PDF, trying them in order.
// `onTry(n, of)` fires before each date form.
export async function unlock(
  create: CreateQpdf,
  input: Uint8Array,
  candidates: Candidate[],
  onTry?: (n: number, of: number) => void,
): Promise<Outcome | Prompt> {
  for (const [i, { password, form, trimmed }] of candidates.entries()) {
    if (form) onTry?.(i + 1, candidates.length)
    const result = await decryptWith(create, input, password)
    if (result.type === 'unlocked') return { ...result, form, trimmed }
    if (result.type !== 'wrong-password') return result
  }
  return { type: 'wrong-password' }
}

// Removes the lock with one open password, or with none for a restricted PDF.
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
  if (output) {
    const read = await inspect(create, input, output, args)
    return { type: 'unlocked', pdf: output, hadPassword: password !== null, password, form: null, trimmed: false, ...read }
  }
  if (isPasswordError(errors)) return { type: password === null ? 'needs-password' : 'wrong-password' }
  return unreadable(errors)
}

// How qpdf --show-encryption says each restriction is set, in the order Sphynx names them.
const refused: [Restriction, RegExp][] = [
  ['print', /^print (low|high) resolution: not allowed$/m],
  ['copy', /^extract for any purpose: not allowed$/m],
  ['edit', /^modify anything: not allowed$/m],
]

// Reads what Done shows about the unlocked copy: its page count, which needs no password, and the
// restrictions the input had, read with the password that opened it. Neither is worth failing an
// unlock over, so a run that fails or throws leaves its part out.
async function inspect(create: CreateQpdf, input: Uint8Array, output: Uint8Array, password: string[]) {
  const failed = { ok: false, stdout: '' }
  const npages = await run(create, output, ['--show-npages', '/in.pdf']).catch(() => failed)
  const encryption = await run(create, input, [...password, '--show-encryption', '/in.pdf']).catch(() => failed)
  const pages = npages.ok ? Number.parseInt(npages.stdout, 10) : NaN
  return {
    pages: Number.isInteger(pages) ? pages : null,
    removed: encryption.ok ? refused.filter(([, line]) => line.test(encryption.stdout)).map(([restriction]) => restriction) : [],
  }
}

// AES-256 takes at most 127 UTF-8 bytes of password; qpdf writes a longer one into a copy that
// nothing opens, not even with that password.
export const isOwnPasswordTooLong = (password: string) => new TextEncoder().encode(password).length > 127

// The named flags keep an own password that starts with "--" from reading as a flag.
export async function lock(create: CreateQpdf, input: Uint8Array, password: string): Promise<Uint8Array> {
  // An empty open password would give a copy that opens without one.
  if (!password) throw new Error('An own password cannot be empty')
  if (isOwnPasswordTooLong(password)) throw new Error('An own password cannot be over 127 UTF-8 bytes')
  const args = ['--encrypt', `--user-password=${password}`, `--owner-password=${password}`, '--bits=256', '--']
  const { errors, output } = await run(create, input, [...args, '/in.pdf', '/out.pdf'])
  if (!output) throw new Error(errors || 'qpdf could not lock the copy')
  return output
}

// qpdf prefixes messages with "<program>: /in.pdf: ".
function unreadable(errors: string): Outcome {
  const detail = errors.split('\n')[0]?.replace(/^.*?\/in\.pdf:\s*/, '').trim()
  const message = detail ? `This file could not be read as a PDF (${detail}).` : 'This file could not be read as a PDF.'
  return { type: 'unreadable', message }
}
