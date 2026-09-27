import '@fontsource-variable/geist/wght.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import './style.css'
import { isOwnPasswordTooLong } from './unlock'
import type { WorkerResponse } from './unlock.worker'
import { SHARE_ACTION, SHARE_CACHE, SHARED_AT_HEADER, SHARED_FILE, SHARED_NAME_HEADER, isLeftover } from './share-target'
import { cardLine, formatSize, isPdf, lockedName, uniqueNames, unlockedName } from './file'
import { browserName, isIos as detectIos, modifierKey, type Brand } from './platform'
import { tryingText, wrongText } from './dates'
import { doneText, saveAllChoice, saveChoice, zipFailed } from './save'
import { rowText, type RowState, type Summary } from './batch'
import { createAttempt, views, type Prompt, type Stop, type Unlocked, type View } from './attempt'
import { storeZip } from './zip'

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

const fileInput = byId<HTMLInputElement>('file')
const drop = byId('drop')
const unlockForm = byId<HTMLFormElement>('unlock')
const password = byId<HTMLInputElement>('password')
const field = byId('field')
const reveal = byId<HTMLButtonElement>('reveal')
const wrong = byId('wrong')
const capsLock = byId('caps-lock')
const submit = byId<HTMLButtonElement>('submit')
const unlockCat = byId('unlock-cat')
const download = byId<HTMLAnchorElement>('download')
const share = byId<HTMLButtonElement>('share')
const addPassword = byId<HTMLButtonElement>('add-password')
const relockForm = byId<HTMLFormElement>('relock')
const ownPassword = byId<HTMLInputElement>('new-password')
const ownReveal = byId<HTMLButtonElement>('new-reveal')
const lockSubmit = byId<HTMLButtonElement>('lock-submit')
const remember = byId<HTMLInputElement>('remember')
const shareAll = byId<HTMLButtonElement>('share-all')
const saveAll = byId<HTMLButtonElement>('save-all')
const steps = [...byId('steps').children]
const toastBox = byId('toast')
const about = byId<HTMLDialogElement>('about')
const install = byId<HTMLButtonElement>('install')
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const platform =
  (navigator as { userAgentData?: { platform: string } }).userAgentData?.platform || navigator.platform || navigator.userAgent
const isIos = detectIos(platform, navigator.maxTouchPoints)

let worker: Worker | null = null
let unlocked: File | null = null
let offered: File | null = null
let downloadUrl: string | null = null
let prompt: Prompt | null = null
let isWrong = false
let toastTimer = 0
// A batch's unlocked copies and their object URLs stay in memory until Unlock more or leaving.
let batch: { picked: string[]; names: string[]; copies: (File | null)[]; urls: string[] } | null = null

function show(view: View, direction: 'fwd' | 'back' | null) {
  if (!direction) return entered(view)
  // sw.ts took over with a new build: load it on the way back to the start screen.
  if (view === 'pick' && updateReady) return location.reload()
  document.documentElement.dataset.dir = direction
  const swap = () => {
    const hasBack = view === 'unlock' || view === 'relock'
    for (const v of views) byId(v).hidden = v !== view
    byId('brand').hidden = hasBack
    byId('back').hidden = !hasBack
    byId('counter').hidden = view !== 'unlock' || !prompt?.batch
    entered(view)
  }
  if (!document.startViewTransition || reducedMotion.matches) return swap()
  document.documentElement.classList.add('vt')
  // A newer transition skips this one; the swap still runs, but WebKit rejects `ready` with an AbortError.
  document.startViewTransition(swap).ready.catch(() => {})
}

function entered(view: View) {
  if (view === 'relock') return ownPassword.focus()
  if (view !== 'unlock') return
  password.focus()
  password.select()
  if (prompt?.wrong) markWrong()
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
  steps.forEach((li, i) => (li.querySelector('.step-label')!.textContent = labels[i]))
  byId('busy-name').textContent = name
}

function setTrying(count: { n: number; of: number } | null) {
  byId('trying').hidden = !count
  if (count) byId('trying').textContent = tryingText(count.n, count.of)
}

function setProgress(percent: number) {
  byId('trying').hidden = false
  byId('trying').textContent = `${percent}%`
}

function stop(reason: Stop) {
  let title = 'That didn’t work.'
  let text: string
  switch (reason.type) {
    case 'not-locked':
      title = 'Nothing to unlock.'
      text = `${reason.name} has no password. It already opens anywhere.`
      break
    case 'not-pdf':
      title = 'That’s not a PDF.'
      text = `${reason.name} is not a PDF. Choose a PDF file.`
      break
    case 'crashed':
      text = 'Unlocking failed. Reload the page and try again.'
      break
    case 'failed':
      text = reason.text
  }
  byId('stop-title').textContent = title
  byId('stop-text').textContent = text
  byId('stop-cat').className = reason.type === 'not-locked' ? 'art cat-5 float' : 'art cat-4'
}

// Drop everything tied to the last file: typed passwords, output blobs.
function clear() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  downloadUrl = null
  unlocked = null
  offered = null
  for (const url of batch?.urls ?? []) URL.revokeObjectURL(url)
  batch = null
  password.value = ''
  fileInput.value = ''
  submit.disabled = false
  setReveal(false)
  setWrong(false)
  clearOwnPassword()
}

function askPassword(asked: Prompt) {
  prompt = asked
  if (!asked.wrong) {
    password.value = ''
    setWrong(false)
    capsLock.hidden = true
  }
  if (asked.batch) byId('counter').textContent = `${asked.batch.at + 1} of ${asked.batch.of}`
  byId('remember-row').hidden = !asked.batch
  byId('cancel').textContent = asked.batch ? 'Skip this file' : 'Cancel'
  byId('unlock-name').textContent = asked.name
  byId('unlock-info').textContent = `${formatSize(asked.size)} · Password protected`
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
  byId('wrong-text').textContent = wrongText(prompt!.tried)
  setWrong(true)
  replay(field, 'shake')
  replay(wrong, 'err')
  replay(byId('unlock-cat-wrap'), 'swap')
}

function showUnlocked({ pdf, hadPassword, password: worked, form, trimmed, pages, removed }: Unlocked, file: { name: string; size: number }) {
  password.value = ''
  const name = unlockedName(file.name)
  unlocked = new File([pdf as BlobPart], name, { type: 'application/pdf' })
  offer(unlocked)
  setDoneLocked(false)
  byId('done-name').textContent = name
  byId('done-info').textContent = cardLine(unlocked.size, pages)
  byId('done-text').textContent = doneText(file.name, hadPassword, file.size - unlocked.size, { of: file.size, password: worked, form, trimmed, removed })
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
  byId('done-art').classList.toggle('cat-3', !on)
  byId('done-art').classList.toggle('cat-6', on)
  addPassword.hidden = on
}

// Unlike the open password, the own password shows as it is typed until the eye toggle hides it.
function clearOwnPassword() {
  ownPassword.value = ''
  checkOwnPassword()
  setReveal(true, ownPassword, ownReveal)
}

function checkOwnPassword() {
  const tooLong = isOwnPasswordTooLong(ownPassword.value)
  byId('too-long').hidden = !tooLong
  byId('new-field').classList.toggle('wrong', tooLong)
  ownPassword.setAttribute('aria-invalid', String(tooLong))
  lockSubmit.disabled = attempt.locking || !ownPassword.value || tooLong
}

function showLocked(pdf: Uint8Array, pages: number | null) {
  const name = lockedName(unlocked!.name)
  offer(new File([pdf as BlobPart], name, { type: 'application/pdf' }))
  setDoneLocked(true)
  byId('done-text').textContent = doneText('locked')
  byId('done-name').textContent = name
  byId('done-info').textContent = cardLine(pdf.length, pages, true)
}

function setReveal(on: boolean, input = password, button = reveal) {
  input.type = on ? 'text' : 'password'
  button.setAttribute('aria-label', on ? 'Hide password' : 'Show password')
  button.setAttribute('aria-pressed', String(on))
}

function toast(text: string, ms = 1800) {
  byId('toast-text').textContent = text
  toastBox.hidden = false
  replay(toastBox, 'toast')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toastBox.hidden = true), ms)
}

function startBatch(files: File[], states: RowState[]) {
  const picked = files.map((file) => file.name)
  batch = { picked, names: uniqueNames(picked.map((name) => unlockedName(name || 'document.pdf'))), copies: [], urls: [] }
  remember.checked = true
  byId('batch-title').textContent = `Unlocking ${files.length} files`
  byId('batch-rows').replaceChildren(...picked.map((name, i) => row(name, states[i])))
}

function row(name: string, state: RowState) {
  const li = document.createElement('li')
  li.dataset.state = state
  li.append(
    Object.assign(document.createElement('span'), { className: 'row-name', textContent: name }),
    Object.assign(document.createElement('span'), { className: 'row-state', textContent: rowText[state] }),
  )
  return li
}

// Patches the rows that changed, so the list never replays its entrance.
function paint(states: RowState[]) {
  for (const [i, li] of [...byId('batch-rows').children].entries()) {
    if (!(li instanceof HTMLElement) || li.dataset.state === states[i]) continue
    li.dataset.state = states[i]
    li.querySelector('.row-state')!.textContent = rowText[states[i]]
  }
}

const unlockedCopies = (copies: (File | null)[]) => copies.filter((copy): copy is File => !!copy)

function finishBatch({ title, lede, unlocked: count }: Summary, states: RowState[]) {
  const run = batch!
  for (const url of run.urls) URL.revokeObjectURL(url)
  run.urls = []
  const choice = saveAllChoice(count, !!count && !!navigator.canShare?.({ files: unlockedCopies(run.copies) }), isIos)
  byId('batch-done-title').textContent = title
  byId('batch-done-text').textContent = lede
  byId('batch-done-art').classList.toggle('cat-3', !count)
  byId('batch-done-art').classList.toggle('cat-7', !!count)
  byId('batch-done-rows').replaceChildren(
    ...run.picked.map((name, i) => {
      const state = states[i]
      const li = row(name, state)
      const copy = run.copies[i]
      if (copy) li.append(saveOne(copy, choice.download))
      if (state === 'skipped') li.append(rowAction('Try again', () => attempt.retry(i)))
      return li
    }),
  )
  shareAll.hidden = !choice.share
  byId('share-all-label').textContent = choice.shareLabel
  saveAll.hidden = !choice.download
  saveAll.classList.toggle('primary', choice.primary === 'download')
  saveAll.classList.toggle('secondary', choice.primary === 'share')
}

function rowAction(text: string, onClick: () => void) {
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'row-action tap', textContent: text })
  button.addEventListener('click', onClick)
  return button
}

// The share sheet where a download would open a viewer instead.
function saveOne(copy: File, canDownload: boolean) {
  if (!canDownload) return rowAction('Save', () => shareFiles([copy]))
  const url = URL.createObjectURL(copy)
  batch!.urls.push(url)
  const link = Object.assign(document.createElement('a'), { className: 'row-action tap', href: url, download: copy.name, textContent: 'Save' })
  link.addEventListener('click', () => toast('Download started'))
  return link
}

async function shareFiles(files: File[]) {
  try {
    await navigator.share({ files })
    toast('Done')
  } catch {
    // Closing the share sheet rejects; nothing to do.
  }
}

const attempt = createAttempt(
  {
    show,
    busy: setBusy,
    steps: setSteps,
    trying: setTrying,
    progress: setProgress,
    ask: askPassword,
    ready: () => (submit.disabled = false),
    unlocked: showUnlocked,
    locked: showLocked,
    stop,
    clear,
    leftRelock: clearOwnPassword,
    lockFailed() {
      clearOwnPassword()
      byId('done-text').textContent = doneText('lock-failed')
    },
    batch: startBatch,
    rows: paint,
    copy(index, { pdf }) {
      password.value = ''
      batch!.copies[index] = new File([pdf as BlobPart], batch!.names[index], { type: 'application/pdf' })
    },
    batchDone: finishBatch,
  },
  {
    start(id) {
      worker = new Worker(new URL('./unlock.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => attempt.answer(id, event.data)
      worker.onerror = () => attempt.crashed(id)
    },
    send: (request) => worker?.postMessage(request),
    stop() {
      worker?.terminate()
      worker = null
    },
  },
  { reduced: () => reducedMotion.matches },
)

fileInput.addEventListener('change', () => {
  const files = [...(fileInput.files ?? [])]
  if (files.length) attempt.open(files)
})

unlockForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (attempt.submit(password.value, remember.checked)) submit.disabled = true
})

password.addEventListener('input', () => {
  if (!isWrong) return
  setWrong(false)
  replay(byId('unlock-cat-wrap'), 'swap')
})

// Caps Lock can only be read from a key event, so the hint waits for the first keystroke.
for (const type of ['keydown', 'keyup'] as const) {
  password.addEventListener(type, (event) => {
    // Chrome's autofill fires a plain Event named keydown, with no modifier state.
    if (event instanceof KeyboardEvent) capsLock.hidden = !event.getModifierState('CapsLock')
  })
}

reveal.addEventListener('click', () => setReveal(password.type === 'password'))

addPassword.addEventListener('click', () => {
  byId('relock-name').textContent = unlocked!.name
  byId('relock-info').textContent = `${formatSize(unlocked!.size)} · No password`
  attempt.addPassword()
})

relockForm.addEventListener('submit', (event) => {
  event.preventDefault()
  lockSubmit.disabled = true
  attempt.lock(unlocked!, ownPassword.value)
  ownPassword.value = ''
})

ownPassword.addEventListener('input', checkOwnPassword)
ownReveal.addEventListener('click', () => setReveal(ownPassword.type === 'password', ownPassword, ownReveal))
byId('relock-cancel').addEventListener('click', attempt.leaveRelock)
byId('back').addEventListener('click', attempt.back)

share.addEventListener('click', () => offered && shareFiles([offered]))

shareAll.addEventListener('click', () => batch && shareFiles(unlockedCopies(batch.copies)))

saveAll.addEventListener('click', async () => {
  const run = batch
  if (!run) return
  const files = await Promise.all(unlockedCopies(run.copies).map(async (copy) => ({ name: copy.name, bytes: new Uint8Array(await copy.arrayBuffer()) })))
  if (batch !== run) return
  let zip: Uint8Array
  try {
    zip = storeZip(files)
  } catch (error) {
    const failed = zipFailed(error)
    if (!failed) throw error
    return toast(failed.text, failed.ms)
  }
  const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }))
  run.urls.push(url)
  Object.assign(document.createElement('a'), { href: url, download: 'unlocked.zip' }).click()
  toast('Download started')
})

download.addEventListener('click', () => toast('Download started'))

for (const button of document.querySelectorAll('[data-reset]')) button.addEventListener('click', attempt.cancel)

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
  const files = [...(event.dataTransfer?.files ?? [])]
  const file = files[0]
  if (!file) return
  if (files.some(isPdf)) return attempt.open(files.filter(isPdf))
  attempt.notPdf(file.name)
})

document.addEventListener('paste', (event) => {
  if (event.target === password || event.target === ownPassword) return
  const files = [...(event.clipboardData?.files ?? [])].filter(isPdf)
  if (!files.length) return
  event.preventDefault()
  attempt.open(files)
})

// Desktop: "Open with Sphynx" once installed (manifest file_handlers).
type LaunchParams = { files: FileSystemFileHandle[] }
const launchQueue = (window as { launchQueue?: { setConsumer(fn: (p: LaunchParams) => void): void } }).launchQueue
launchQueue?.setConsumer(async ({ files }) => {
  if (files[0]) attempt.open([await files[0].getFile()])
})

// Android: shared from another app (manifest share_target, parked by the service worker).
async function takeSharedFile() {
  // Reaching the share URL as a page means the browser skipped the service worker or sent no file.
  if (location.pathname === SHARE_ACTION) {
    const detail = location.search || 'no data'
    history.replaceState(null, '', '/')
    return attempt.fail(`The share opened without its file (${detail}). Use Choose PDFs instead.`)
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
    return attempt.fail('Your browser did not pass the shared file to the app. Use Choose PDFs instead.')
  }
  const name = decodeURIComponent(response.headers.get(SHARED_NAME_HEADER) ?? 'shared.pdf')
  attempt.open([new File([await response.blob()], name, { type: 'application/pdf' })])
}

takeSharedFile()

// sw.ts takes over as soon as a new build installs, but this page still runs the old one.
// Reload into it when nothing is in progress, else on the next return to the start screen.
let updateReady = false
if (navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    updateReady = true
    if (attempt.view === 'pick' && !about.open) location.reload()
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
