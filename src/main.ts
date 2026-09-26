import '@fontsource-variable/geist/wght.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './style.css'
import type { WorkerRequest, WorkerResponse } from './unlock.worker'
import { SHARE_ACTION, SHARE_CACHE, SHARED_AT_HEADER, SHARED_FILE, SHARED_NAME_HEADER, isLeftover } from './share-target'
import { formatSize, isPdf, unlockedName } from './file'
import { browserName, isIos as detectIos, modifierKey, type Brand } from './platform'
import { dateForms, tryingText, wrongText } from './dates'
import { doneText, saveChoice } from './save'
import { createPacer } from './pace'

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const views = ['pick', 'busy', 'unlock', 'done', 'stop'] as const
type View = (typeof views)[number]
// A deeper view slides in from the right, a shallower one from the left.
const depth: Record<View, number> = { pick: 0, unlock: 1, busy: 2, done: 3, stop: 3 }

const fileInput = byId<HTMLInputElement>('file')
const drop = byId('drop')
const unlockForm = byId<HTMLFormElement>('unlock')
const password = byId<HTMLInputElement>('password')
const field = byId('field')
const reveal = byId<HTMLButtonElement>('reveal')
const wrong = byId('wrong')
const submit = byId<HTMLButtonElement>('submit')
const unlockCat = byId('unlock-cat')
const download = byId<HTMLAnchorElement>('download')
const share = byId<HTMLButtonElement>('share')
const steps = [...byId('steps').children]
const toastBox = byId('toast')
const about = byId<HTMLDialogElement>('about')
const install = byId<HTMLButtonElement>('install')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const platform =
  (navigator as { userAgentData?: { platform: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent
const isIos = detectIos(platform, navigator.maxTouchPoints)

// Work that ends within this many ms skips the Unlocking screen, so a quick answer does not flash it.
const PATIENCE = 300
// Once the Unlocking screen shows, its steps tick at least this many ms apart. Batch rows change at
// least ROW_FLOOR apart, adding at most ROW_CAP of wait per batch; date tries count TRY_FLOOR apart.
// Every floor is 0 under reduced motion. Exported so the ones no screen uses yet still typecheck.
const STEP_FLOOR = 350
export const ROW_FLOOR = 200
export const ROW_CAP = 2000
export const TRY_FLOOR = 150

let worker: Worker | null = null
let fileName = ''
let fileSize = 0
let unlocked: File | null = null
let downloadUrl: string | null = null
let current: View = 'pick'
let step = 1
let isWrong = false
let pending = 0
let toastTimer = 0
let pace = createPacer(0)
let tries = createPacer(0)
let datesTried = 0

function show(view: View, then?: () => void) {
  if (view === current) return then?.()
  document.documentElement.dataset.dir = depth[view] < depth[current] ? 'back' : 'fwd'
  current = view
  const swap = () => {
    for (const v of views) byId(v).hidden = v !== view
    byId('brand').hidden = view === 'unlock'
    byId('back').hidden = view !== 'unlock'
    then?.()
  }
  if (!document.startViewTransition || reducedMotion.matches) return swap()
  document.documentElement.classList.add('vt')
  // A newer transition skips this one; the swap still runs, but WebKit rejects `ready` with an AbortError.
  document.startViewTransition(swap).ready.catch(() => {})
}

// Re-adding a class does not restart its animation, so restart them by hand.
function replay(el: Element, className: string) {
  el.classList.add(className)
  for (const animation of el.getAnimations()) {
    if (!(animation instanceof CSSAnimation)) continue
    animation.cancel()
    animation.play()
  }
}

function setSteps(n: number) {
  step = n
  steps.forEach((li, i) => {
    li.classList.toggle('is-done', i + 1 < n)
    li.classList.toggle('is-active', i + 1 === n)
  })
}

function showBusy() {
  byId('busy-name').textContent = fileName
  setSteps(step)
  show('busy')
  // Appearing is the screen's first tick, so the next update waits a step floor after it.
  pace.push(() => {})
}

function wait() {
  byId('trying').hidden = true
  clearTimeout(pending)
  pending = window.setTimeout(showBusy, PATIENCE)
}

function stop(title: string, text: string, asleep = false) {
  clearTimeout(pending)
  byId('stop-title').textContent = title
  byId('stop-text').textContent = text
  byId('stop-cat').className = asleep ? 'art cat-5 float' : 'art cat-4'
  show('stop')
}

const fail = (text: string) => stop('That didn’t work.', text)

// Drop everything tied to the last file: worker memory, typed password, output blob.
function clear() {
  clearTimeout(pending)
  worker?.terminate()
  worker = null
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = null
  unlocked = null
  password.value = ''
  fileInput.value = ''
  submit.disabled = false
  setReveal(false)
  setWrong(false)
}

function reset() {
  clear()
  if (updateReady) return location.reload()
  show('pick')
}

function send(request: WorkerRequest) {
  worker?.postMessage(request)
}

function openFile(file: File) {
  clear()
  fileName = file.name || 'document.pdf'
  fileSize = file.size
  step = 1
  pace = createPacer(reducedMotion.matches ? 0 : STEP_FLOOR)
  tries = createPacer(reducedMotion.matches ? 0 : TRY_FLOOR)
  const attempt = new Worker(new URL('./unlock.worker.ts', import.meta.url), { type: 'module' })
  worker = attempt
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => receive(attempt, event.data)
  worker.onerror = () => fail('Unlocking failed. Reload the page and try again.')
  wait()
  send({ type: 'open', file })
}

// Answers before the Unlocking screen shows are not paced, so quick work never shows it. A queued
// answer is dropped once its attempt is abandoned or another screen, such as a stop, has replaced it.
function receive(attempt: Worker, response: WorkerResponse) {
  if (current !== 'busy') return handle(response)
  const live = () => worker === attempt && current === 'busy'
  if (response.type === 'trying') return tries.push(() => live() && handle(response))
  tries.push(() => pace.push(() => live() && handle(response)))
}

function handle(response: WorkerResponse) {
  if (response.type === 'restricted') return setSteps(2)
  if (response.type === 'trying') {
    byId('trying').textContent = tryingText(response.n, response.of)
    byId('trying').hidden = false
    return
  }
  clearTimeout(pending)
  submit.disabled = false
  switch (response.type) {
    case 'needs-password':
    case 'wrong-password':
      return askPassword(response.type === 'wrong-password')
    case 'not-locked':
      worker?.terminate()
      return stop('Nothing to unlock.', `${fileName} has no password. It already opens anywhere.`, true)
    case 'unlocked':
      return finish(response)
    case 'unreadable':
      worker?.terminate()
      return fail(response.message)
  }
}

function askPassword(wrongOne: boolean) {
  byId('unlock-name').textContent = fileName
  byId('unlock-info').textContent = `${formatSize(fileSize)} · Password protected`
  show('unlock', () => {
    password.focus()
    password.select()
    if (wrongOne) markWrong()
  })
}

function setWrong(on: boolean) {
  isWrong = on
  wrong.hidden = !on
  field.classList.toggle('wrong', on)
  password.setAttribute('aria-invalid', String(on))
  unlockCat.classList.toggle('cat-1', !on)
  unlockCat.classList.toggle('cat-4', on)
  byId('unlock-title').textContent = on ? 'Not quite.' : 'What’s the password?'
  byId('unlock-sub').textContent = on ? 'That isn’t the password this PDF opens with.' : 'The one you type to open this PDF.'
}

function markWrong() {
  byId('wrong-text').textContent = wrongText(datesTried)
  setWrong(true)
  replay(field, 'shake')
  replay(wrong, 'err')
  replay(byId('unlock-cat-wrap'), 'swap')
}

function finish({ pdf, hadPassword, password: worked, form }: Extract<WorkerResponse, { type: 'unlocked' }>) {
  worker?.terminate()
  worker = null
  password.value = ''
  const name = unlockedName(fileName)
  unlocked = new File([pdf as BlobPart], name, { type: 'application/pdf' })
  downloadUrl = URL.createObjectURL(unlocked)
  download.href = downloadUrl
  download.download = name
  const choice = saveChoice(!!navigator.canShare?.({ files: [unlocked] }), isIos)
  share.hidden = !choice.share
  byId('share-label').textContent = choice.shareLabel
  download.hidden = !choice.download
  download.classList.toggle('primary', choice.primary === 'download')
  download.classList.toggle('secondary', choice.primary === 'share')
  byId('done-name').textContent = name
  byId('done-info').textContent = `${formatSize(unlocked.size)} · No password`
  byId('done-text').textContent = doneText(fileName, hadPassword, fileSize - unlocked.size, { of: fileSize, password: worked, form })
  if (current !== 'busy') return show('done')
  // Let the last step tick before leaving the Unlocking screen.
  setSteps(4)
  pending = window.setTimeout(() => show('done'), reducedMotion.matches ? 0 : 500)
}

function setReveal(on: boolean) {
  password.type = on ? 'text' : 'password'
  reveal.setAttribute('aria-label', on ? 'Hide password' : 'Show password')
  reveal.setAttribute('aria-pressed', String(on))
}

function toast(text: string) {
  byId('toast-text').textContent = text
  toastBox.hidden = false
  replay(toastBox, 'toast')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toastBox.hidden = true), 1800)
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) openFile(file)
})

unlockForm.addEventListener('submit', (event) => {
  event.preventDefault()
  submit.disabled = true
  step = 2
  const candidates = dateForms(password.value, new Date())
  datesTried = candidates.length - 1
  wait()
  send({ type: 'unlock', candidates })
})

password.addEventListener('input', () => {
  if (!isWrong) return
  setWrong(false)
  replay(byId('unlock-cat-wrap'), 'swap')
})

reveal.addEventListener('click', () => setReveal(password.type === 'password'))

share.addEventListener('click', async () => {
  if (!unlocked) return
  try {
    await navigator.share({ files: [unlocked] })
    toast('Done')
  } catch {
    // Closing the share sheet rejects; nothing to do.
  }
})

download.addEventListener('click', () => toast('Download started'))

for (const button of document.querySelectorAll('[data-reset]')) button.addEventListener('click', reset)

// A dialog closes at once, so play the exit animation first.
function closeAbout() {
  if (reducedMotion.matches) return about.close()
  about.classList.add('closing')
  // Children and the backdrop fire animationend here too; wait for the dialog's own.
  const done = (event: AnimationEvent) => {
    if (event.target !== about || event.pseudoElement) return
    about.removeEventListener('animationend', done)
    about.classList.remove('closing')
    about.close()
  }
  about.addEventListener('animationend', done)
}

byId('how').addEventListener('click', () => about.showModal())
byId('about-close').addEventListener('click', closeAbout)
byId('about-ok').addEventListener('click', closeAbout)
about.addEventListener('click', (event) => {
  if (event.target === about) closeAbout()
})
about.addEventListener('cancel', (event) => {
  event.preventDefault()
  closeAbout()
})

// Chromium only: the browser offers install, and the bar shows a button for it.
type InstallPrompt = Event & { prompt(): Promise<void> }
let installPrompt: InstallPrompt | null = null
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  installPrompt = event as InstallPrompt
  install.hidden = false
})
install.addEventListener('click', async () => {
  await installPrompt?.prompt()
  installPrompt = null
  install.hidden = true
})
window.addEventListener('appinstalled', () => (install.hidden = true))

byId('mod-key').textContent = modifierKey(platform)

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
  else stop('That’s not a PDF.', `${file.name} is not a PDF. Choose a PDF file.`)
})

document.addEventListener('paste', (event) => {
  if (event.target === password) return
  const file = [...(event.clipboardData?.files ?? [])].find(isPdf)
  if (!file) return
  event.preventDefault()
  openFile(file)
})

// Desktop: "Open with Sphynx" once installed (manifest file_handlers).
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
    return fail(`The share opened without its file (${detail}). Use Choose a PDF instead.`)
  }
  if (!('caches' in window)) return
  const params = new URLSearchParams(location.search)
  const shared = params.has('shared')
  if (shared) history.replaceState(null, '', '/')
  const cache = await caches.open(SHARE_CACHE)
  const response = await cache.match(SHARED_FILE)
  if (!shared) {
    // Sweep a file left over from an interrupted share.
    if (response && isLeftover(response.headers.get(SHARED_AT_HEADER), Date.now())) await caches.delete(SHARE_CACHE)
    return
  }
  await caches.delete(SHARE_CACHE)
  if (!response) {
    return fail('Your browser did not pass the shared file to the app. Use Choose a PDF instead.')
  }
  const name = decodeURIComponent(response.headers.get(SHARED_NAME_HEADER) ?? 'shared.pdf')
  openFile(new File([await response.blob()], name, { type: 'application/pdf' }))
}

takeSharedFile()

// sw.ts takes over as soon as a new build installs, but this page still runs the old one.
// Reload into it when nothing is in progress, else on the next return to the start screen.
let updateReady = false
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updateReady = true
    if (current === 'pick' && !about.open) location.reload()
  })
}

const builtAt = new Date(__BUILT_AT__)
const offlineReady = !!navigator.serviceWorker?.controller
// An installed app runs inside the browser that installed it, so this also names the installer.
const installed = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
byId('about-version').textContent = __APP_VERSION__
byId('about-built').textContent = builtAt.toLocaleDateString(undefined, { dateStyle: 'medium' })
byId('about-built').title = builtAt.toLocaleString()
byId('about-offline').textContent = offlineReady ? 'Ready' : 'Not yet'
byId('about-offline').classList.toggle('ready', offlineReady)
const brands = (navigator as { userAgentData?: { brands: Brand[] } }).userAgentData?.brands ?? []
byId('about-browser').textContent = browserName(brands, navigator.userAgent)
byId('about-mode').textContent = installed ? 'Installed app' : 'Browser tab'
