import createModule from '@neslinesli93/qpdf-wasm'
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'
import { lock, open, unlock, type CreateQpdf, type LockResult, type Outcome, type Prompt, type Qpdf } from './unlock'

export type WorkerRequest =
  | { type: 'open'; file: File }
  | { type: 'unlock'; password: string }
  | { type: 'lock'; file: File; password: string }

// `restricted`: the file opens without a password; its restrictions are being removed.
// `crashed`: qpdf threw, most likely out of memory; the page words it for the job it started.
export type WorkerResponse = Outcome | Prompt | LockResult | { type: 'restricted' } | { type: 'crashed' }

const create: CreateQpdf = async () => (await createModule({ locateFile: () => wasmUrl })) as unknown as Qpdf

// Kept between the open and each password try; dropped once unlocked.
let input: Uint8Array | null = null

async function respond(request: WorkerRequest): Promise<WorkerResponse> {
  if (request.type === 'open') {
    input = new Uint8Array(await request.file.arrayBuffer())
    return open(create, input, () => self.postMessage({ type: 'restricted' } satisfies WorkerResponse))
  }
  if (request.type === 'lock') return lock(create, new Uint8Array(await request.file.arrayBuffer()), request.password)
  return unlock(create, input!, request.password)
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse
  try {
    response = await respond(event.data)
  } catch {
    response = { type: 'crashed' }
  }
  if (response.type === 'unlocked') input = null
  const transfer = 'pdf' in response ? [response.pdf.buffer as ArrayBuffer] : []
  self.postMessage(response, { transfer })
}
