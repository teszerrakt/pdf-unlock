import createModule from '@neslinesli93/qpdf-wasm'
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'
import type { Candidate } from './dates'
import { lock, open, unlock, type CreateQpdf, type Outcome, type Prompt, type Qpdf } from './unlock'

export type WorkerRequest =
  | { type: 'open'; file: File }
  | { type: 'unlock'; candidates: Candidate[] }
  | { type: 'lock'; file: File; password: string }

// `restricted`: the file opens without a password; its restrictions are being removed.
// `trying`: candidate `n` of `of` is being tried, after the ones before it missed.
export type WorkerResponse =
  | Outcome
  | Prompt
  | { type: 'restricted' }
  | { type: 'trying'; n: number; of: number }
  | { type: 'locked'; pdf: Uint8Array }

const create: CreateQpdf = async () => (await createModule({ locateFile: () => wasmUrl })) as unknown as Qpdf

// Kept between the open and each password try; dropped once unlocked.
let input: Uint8Array | null = null

async function respond(request: WorkerRequest): Promise<WorkerResponse> {
  if (request.type === 'open') {
    input = new Uint8Array(await request.file.arrayBuffer())
    return open(create, input, () => self.postMessage({ type: 'restricted' } satisfies WorkerResponse))
  }
  if (request.type === 'lock') {
    return { type: 'locked', pdf: await lock(create, new Uint8Array(await request.file.arrayBuffer()), request.password) }
  }
  return unlock(create, input!, request.candidates, (n, of) => self.postMessage({ type: 'trying', n, of } satisfies WorkerResponse))
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    response = await respond(event.data)
  } catch {
    response = { type: 'unreadable', message: 'Unlocking failed. The file may be too large for this device.' }
  }
  if (response.type === 'unlocked') input = null
  const transfer = 'pdf' in response ? [response.pdf.buffer as ArrayBuffer] : []
  self.postMessage(response, { transfer })
}
