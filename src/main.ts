import './style.css'
import type { WorkerRequest, WorkerResponse } from './unlock.worker'
import { SHARE_ACTION, SHARE_CACHE, SHARED_AT_HEADER, SHARED_FILE, SHARED_NAME_HEADER } from './share-target'

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const views = ['pick', 'busy', 'unlock', 'done', 'stop'] as const
type View = (typeof views)[number]

const fileInput = byId<HTMLInputElement>('file')
const drop = byId('drop')
const unlockForm = byId<HTMLFormElement>('unlock')
const password = byId<HTMLInputElement>('password')
const reveal = byId<HTMLButtonElement>('reveal')
const wrong = byId('wrong')
const download = byId<HTMLAnchorElement>('download')
const share = byId<HTMLButtonElement>('share')

let worker: Worker | null = null
let fileName = ''
let unlocked: File | null = null
let downloadUrl: string | null = null

function show(view: View) {
  for (const v of views) byId(v).hidden = v !== view
}

function busy(text: string) {
  byId('busy-text').textContent = text
  show('busy')
}

function stop(text: string) {
  byId('stop-text').textContent = text
  show('stop')
}

// Drop everything tied to the last file: worker memory, typed password, output blob.
function reset() {
  worker?.terminate()
  worker = null
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = null
  unlocked = null
  password.value = ''
  fileInput.value = ''
  setReveal(false)
  show('pick')
}

function send(request: WorkerRequest) {
  worker?.postMessage(request)
}

function openFile(file: File) {
  reset()
  fileName = file.name || 'document.pdf'
  worker = new Worker(new URL('./unlock.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => handle(event.data)
  worker.onerror = () => stop('Unlocking failed. Reload the page and try again.')
  busy(`Reading ${fileName}…`)
  send({ type: 'open', file })
}

function handle(response: WorkerResponse) {
  switch (response.type) {
    case 'needs-password':
    case 'wrong-password':
      byId('unlock-file').textContent = fileName
      wrong.hidden = response.type === 'needs-password'
      show('unlock')
      password.focus()
      password.select()
      return
    case 'not-encrypted':
      worker?.terminate()
      return stop(`${fileName} has no password. There is nothing to unlock.`)
    case 'unlocked':
      return finish(response.pdf, response.hadPassword)
    case 'error':
      worker?.terminate()
      return stop(response.message)
  }
}

function finish(pdf: Uint8Array, hadPassword: boolean) {
  worker?.terminate()
  worker = null
  password.value = ''
  const name = fileName.replace(/(\.pdf)?$/i, '-unlocked.pdf')
  unlocked = new File([pdf as BlobPart], name, { type: 'application/pdf' })
  downloadUrl = URL.createObjectURL(unlocked)
  download.href = downloadUrl
  download.download = name
  share.hidden = !navigator.canShare?.({ files: [unlocked] })
  byId('done-text').textContent = hadPassword
    ? `Password removed. ${name} is ready.`
    : `${fileName} had no open password, only print or copy restrictions. They are removed in ${name}.`
  show('done')
}

function setReveal(on: boolean) {
  password.type = on ? 'text' : 'password'
  reveal.textContent = on ? 'Hide' : 'Show'
  reveal.setAttribute('aria-pressed', String(on))
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) openFile(file)
})

unlockForm.addEventListener('submit', (event) => {
  event.preventDefault()
  busy('Unlocking…')
  send({ type: 'unlock', password: password.value })
})

reveal.addEventListener('click', () => setReveal(password.type === 'password'))

share.addEventListener('click', async () => {
  if (!unlocked) return
  try {
    await navigator.share({ files: [unlocked] })
  } catch {
    // Closing the share sheet rejects; nothing to do.
  }
})

for (const button of document.querySelectorAll('[data-reset]')) button.addEventListener('click', reset)

window.addEventListener('dragover', (event) => {
  event.preventDefault()
  drop.classList.add('over')
})
window.addEventListener('dragleave', (event) => {
  if (!event.relatedTarget) drop.classList.remove('over')
})
window.addEventListener('drop', (event) => {
  event.preventDefault()
  drop.classList.remove('over')
  const file = event.dataTransfer?.files[0]
  if (!file) return
  if (isPdf(file)) openFile(file)
  else stop(`${file.name} is not a PDF.`)
})

document.addEventListener('paste', (event) => {
  if (event.target === password) return
  const file = [...(event.clipboardData?.files ?? [])].find(isPdf)
  if (!file) return
  event.preventDefault()
  openFile(file)
})

// Desktop: "Open with PDF Unlock" once installed (manifest file_handlers).
type LaunchParams = { files: FileSystemFileHandle[] }
const launchQueue = (window as { launchQueue?: { setConsumer(fn: (p: LaunchParams) => void): void } }).launchQueue
launchQueue?.setConsumer(async ({ files }) => {
  if (files[0]) openFile(await files[0].getFile())
})

// Android: shared from another app (manifest share_target, parked by the service worker).
async function takeSharedFile() {
  // Reaching the share URL as a page means the browser skipped the service worker or sent no file.
  if (location.pathname === SHARE_ACTION) {
    const detail = location.search || 'no data'
    history.replaceState(null, '', '/')
    return stop(`The share opened without its file (${detail}). Use Choose a PDF instead.`)
  }
  if (!('caches' in window)) return
  const params = new URLSearchParams(location.search)
  const shared = params.has('shared')
  if (shared) history.replaceState(null, '', '/')
  const cache = await caches.open(SHARE_CACHE)
  const response = await cache.match(SHARED_FILE)
  if (!shared) {
    // Another window may be mid-share, so only sweep a file left over from an interrupted one.
    const age = Date.now() - Number(response?.headers.get(SHARED_AT_HEADER) ?? 0)
    if (response && age > 60_000) await caches.delete(SHARE_CACHE)
    return
  }
  await caches.delete(SHARE_CACHE)
  if (!response) {
    return stop('Your browser did not pass the shared file to the app. Use Choose a PDF instead.')
  }
  const name = decodeURIComponent(response.headers.get(SHARED_NAME_HEADER) ?? 'shared.pdf')
  openFile(new File([await response.blob()], name, { type: 'application/pdf' }))
}

takeSharedFile()

const built = new Date(__BUILT_AT__).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const offline = navigator.serviceWorker?.controller ? 'offline ready' : 'not offline yet'
// An installed app runs inside the browser that installed it, so this also names the installer.
const installed = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const mode = installed ? 'installed app' : 'browser tab'
byId('version').textContent = `v${__APP_VERSION__} · built ${built} · ${offline} · ${browserName()} · ${mode}`

function browserName() {
  type Brand = { brand: string; version: string }
  const brands = (navigator as { userAgentData?: { brands: Brand[] } }).userAgentData?.brands ?? []
  const brand = brands.find((b) => !/not.?a.?brand|chromium/i.test(b.brand)) ?? brands.find((b) => /chromium/i.test(b.brand))
  if (brand) return `${brand.brand} ${brand.version}`
  const ua = navigator.userAgent
  const known: [RegExp, string][] = [
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/EdgiOS\/(\d+)|Edg\/(\d+)/, 'Microsoft Edge'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/FxiOS\/(\d+)|Firefox\/(\d+)/, 'Firefox'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+[.\d]*).*Safari/, 'Safari'],
  ]
  for (const [pattern, name] of known) {
    const match = ua.match(pattern)
    if (match) return `${name} ${match.slice(1).find(Boolean)}`
  }
  return 'unknown browser'
}
