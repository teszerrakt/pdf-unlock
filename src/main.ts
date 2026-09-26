import '@fontsource-variable/geist/wght.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './style.css'
import type { WorkerRequest, WorkerResponse } from './unlock.worker'
import { SHARE_ACTION, SHARE_CACHE, SHARED_AT_HEADER, SHARED_FILE, SHARED_NAME_HEADER, isLeftover } from './share-target'
import { formatSize, isPdf, lockedName, unlockedName } from './file'
import { browserName, isIos as detectIos, modifierKey, type Brand } from './platform'
import { doneText, saveChoice } from './save'

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const views = ['pick', 'busy', 'unlock', 'done', 'stop', 'relock'] as const
type View = (typeof views)[number]
// A deeper view slides in from the right, a shallower one from the left.
const depth: Record<View, number> = { pick: 0, unlock: 1, busy: 2, done: 3, stop: 3, relock: 4 }

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
const addPassword = byId<HTMLButtonElement>('add-password')
const relockForm = byId<HTMLFormElement>('relock')
const ownPassword = byId<HTMLInputElement>('new-password')
const ownReveal = byId<HTMLButtonElement>('new-reveal')
const lockSubmit = byId<HTMLButtonElement>('lock-submit')
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

let worker: Worker | null = null
let fileName = ''
let fileSize = 0
let unlocked: File | null = null
let offered: File | null = null
let downloadUrl: string | null = null
let current: View = 'pick'
let step = 1
let isWrong = false
let pending = 0
let toastTimer = 0
// Locking runs after Done, so its busy and Locked screens slide in forward.
let locking = false

function show(view: View, then?: () => void) {
  if (view === current) return then?.()
  document.documentElement.dataset.dir = depth[view] < depth[current] && !locking ? 'back' : 'fwd'
  current = view
  const swap = () => {
    const hasBack = view === 'unlock' || view === 'relock'
    for (const v of views) byId(v).hidden = v !== view
    byId('brand').hidden = hasBack
    byId('back').hidden = !hasBack
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

const busyText = {
  unlock: ['Unlocking…', 'Reading the file', 'Removing the password', 'Ready to save'],
  lock: ['Locking…', 'Reading the copy', 'Adding your password', 'Ready to save'],
}

function setBusy(kind: keyof typeof busyText, name: string) {
  const [title, ...labels] = busyText[kind]
  byId('busy-heading').textContent = title
  steps.forEach((li, i) => (li.lastElementChild!.textContent = labels[i]))
  byId('busy-name').textContent = name
}

function showBusy() {
  setSteps(step)
  show('busy')
}

function wait() {
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
  offered = null
  locking = false
  password.value = ''
  fileInput.value = ''
  submit.disabled = false
  setReveal(false)
  setWrong(false)
  clearOwnPassword()
}

function reset() {
  clear()
  if (updateReady) return location.reload()
  show('pick')
}

function send(request: WorkerRequest) {
  worker?.postMessage(request)
}

function startWorker() {
  worker = new Worker(new URL('./unlock.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => handle(event.data)
  worker.onerror = () => fail('Unlocking failed. Reload the page and try again.')
}

function openFile(file: File) {
  clear()
  fileName = file.name || 'document.pdf'
  fileSize = file.size
  step = 1
  setBusy('unlock', fileName)
  startWorker()
  wait()
  send({ type: 'open', file })
}

function handle(response: WorkerResponse) {
  if (response.type === 'restricted') return setSteps(2)
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
      return finish(response.pdf, response.hadPassword)
    case 'locked':
      return finishLock(response.pdf)
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
  setWrong(true)
  replay(field, 'shake')
  replay(wrong, 'err')
  replay(byId('unlock-cat-wrap'), 'swap')
}

function finish(pdf: Uint8Array, hadPassword: boolean) {
  worker?.terminate()
  worker = null
  password.value = ''
  const name = unlockedName(fileName)
  unlocked = new File([pdf as BlobPart], name, { type: 'application/pdf' })
  offer(unlocked)
  setDoneLocked(false)
  byId('done-name').textContent = name
  byId('done-info').textContent = `${formatSize(unlocked.size)} · No password`
  byId('done-text').textContent = doneText(fileName, hadPassword)
  if (current !== 'busy') return show('done')
  // Let the last step tick before leaving the Unlocking screen.
  setSteps(4)
  pending = window.setTimeout(() => show('done'), reducedMotion.matches ? 0 : 500)
}

function offer(file: File) {
  offered = file
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = URL.createObjectURL(file)
  download.href = downloadUrl
  download.download = file.name
  const choice = saveChoice(!!navigator.canShare?.({ files: [file] }), isIos)
  share.hidden = !choice.share
  byId('share-label').textContent = choice.shareLabel
  download.hidden = !choice.download
  download.classList.toggle('primary', choice.primary === 'download')
  download.classList.toggle('secondary', choice.primary === 'share')
}

function setDoneLocked(on: boolean) {
  byId('done-title').textContent = on ? 'Locked.' : 'Unlocked.'
  byId('done-badge-open').hidden = on
  byId('done-badge-locked').hidden = !on
  addPassword.hidden = on
}

function askOwnPassword() {
  byId('relock-name').textContent = unlocked!.name
  byId('relock-info').textContent = `${formatSize(unlocked!.size)} · No password`
  show('relock', () => ownPassword.focus())
}

// Unlike the open password, the own password shows as it is typed until the eye toggle hides it.
function clearOwnPassword() {
  ownPassword.value = ''
  lockSubmit.disabled = true
  setReveal(true, ownPassword, ownReveal)
}

// Also stops a lock that started but has not reached the busy screen yet.
function leaveRelock() {
  clearTimeout(pending)
  worker?.terminate()
  worker = null
  locking = false
  clearOwnPassword()
  show('done')
}

function finishLock(pdf: Uint8Array) {
  worker?.terminate()
  worker = null
  const name = lockedName(unlocked!.name)
  offer(new File([pdf as BlobPart], name, { type: 'application/pdf' }))
  setDoneLocked(true)
  byId('done-text').textContent = 'Opens only with the password you set. Printing and copying stay allowed.'
  byId('done-name').textContent = name
  byId('done-info').textContent = `${formatSize(pdf.length)} · Your password`
  if (current !== 'busy') return show('done')
  setSteps(4)
  pending = window.setTimeout(() => show('done'), reducedMotion.matches ? 0 : 500)
}

function setReveal(on: boolean, input = password, button = reveal) {
  input.type = on ? 'text' : 'password'
  button.setAttribute('aria-label', on ? 'Hide password' : 'Show password')
  button.setAttribute('aria-pressed', String(on))
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
  wait()
  send({ type: 'unlock', password: password.value })
})

password.addEventListener('input', () => {
  if (!isWrong) return
  setWrong(false)
  replay(byId('unlock-cat-wrap'), 'swap')
})

reveal.addEventListener('click', () => setReveal(password.type === 'password'))

addPassword.addEventListener('click', askOwnPassword)

relockForm.addEventListener('submit', (event) => {
  event.preventDefault()
  lockSubmit.disabled = true
  locking = true
  step = 2
  setBusy('lock', unlocked!.name)
  startWorker()
  wait()
  send({ type: 'lock', file: unlocked!, password: ownPassword.value })
  ownPassword.value = ''
})

ownPassword.addEventListener('input', () => (lockSubmit.disabled = locking || !ownPassword.value))
ownReveal.addEventListener('click', () => setReveal(ownPassword.type === 'password', ownPassword, ownReveal))
byId('relock-cancel').addEventListener('click', leaveRelock)
byId('back').addEventListener('click', () => (current === 'relock' ? leaveRelock() : reset()))

share.addEventListener('click', async () => {
  if (!offered) return
  try {
    await navigator.share({ files: [offered] })
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
  if (isPdf(file)) return openFile(file)
  // A drop abandons the attempt in progress, so its worker cannot answer over this screen.
  clear()
  stop('That’s not a PDF.', `${file.name} is not a PDF. Choose a PDF file.`)
})

document.addEventListener('paste', (event) => {
  if (event.target === password || event.target === ownPassword) return
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
