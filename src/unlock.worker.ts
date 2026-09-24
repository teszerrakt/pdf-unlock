import createModule from '@neslinesli93/qpdf-wasm'
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'

export type WorkerRequest = { type: 'open'; file: File } | { type: 'unlock'; password: string }

export type WorkerResponse =
  | { type: 'not-encrypted' }
  | { type: 'needs-password' }
  | { type: 'wrong-password' }
  | { type: 'unlocked'; pdf: Uint8Array; hadPassword: boolean }
  | { type: 'error'; message: string }

type Qpdf = {
  callMain(args: string[]): number
  FS: { writeFile(path: string, data: Uint8Array): void; readFile(path: string): Uint8Array }
}

// qpdf binds console.error when instantiated, so replacing it first routes its stderr here.
let stderr: string[] = []
console.error = (...args: unknown[]) => void stderr.push(args.join(' '))

let input: Uint8Array | null = null

// This wasm build reports a missing or wrong password only through stderr (exit code 2 either way).
const isPasswordError = (message: string) => /invalid password/i.test(message)

// A fresh instance per run: qpdf cannot be re-entered after it throws, and no memory outlives the run.
async function qpdf(args: string[]) {
  stderr = []
  const q = (await createModule({ locateFile: () => wasmUrl })) as unknown as Qpdf
  q.FS.writeFile('/in.pdf', input!)
  const code = q.callMain(args)
  const ok = code === 0 || code === 3 // 3 = succeeded with warnings
  const errors = stderr.filter((line) => !line.includes('WARNING')).join('\n')
  const output = ok && args.includes('/out.pdf') ? q.FS.readFile('/out.pdf') : undefined
  return { code, errors, output }
}

async function decrypt(password: string | null): Promise<WorkerResponse> {
  const args = password === null ? [] : [`--password=${password}`]
  const { errors, output } = await qpdf([...args, '--decrypt', '/in.pdf', '/out.pdf'])
  if (output) {
    input = null
    return { type: 'unlocked', pdf: output, hadPassword: password !== null }
  }
  if (isPasswordError(errors)) return { type: password === null ? 'needs-password' : 'wrong-password' }
  return { type: 'error', message: readable(errors) }
}

async function open(file: File): Promise<WorkerResponse> {
  input = new Uint8Array(await file.arrayBuffer())
  const { code, errors } = await qpdf(['--is-encrypted', '/in.pdf'])
  if (code === 0) return decrypt(null) // encrypted, but opens without a password: owner restrictions only
  if (isPasswordError(errors)) return { type: 'needs-password' }
  if (code === 2 && !errors) return { type: 'not-encrypted' }
  return { type: 'error', message: readable(errors) }
}

// qpdf prefixes messages with "<program>: /in.pdf: ".
function readable(errors: string) {
  const detail = errors.split('\n')[0]?.replace(/^.*?\/in\.pdf:\s*/, '').trim()
  return detail ? `This file could not be read as a PDF (${detail}).` : 'This file could not be read as a PDF.'
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  let response: WorkerResponse
  try {
    response = request.type === 'open' ? await open(request.file) : await decrypt(request.password)
  } catch {
    response = { type: 'error', message: 'Unlocking failed. The file may be too large for this device.' }
  }
  const transfer = response.type === 'unlocked' ? [response.pdf.buffer as ArrayBuffer] : []
  self.postMessage(response, { transfer })
}
