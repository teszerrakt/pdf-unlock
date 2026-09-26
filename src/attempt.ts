// Runs one attempt at a time (see Attempt in CONTEXT.md): one file, a lock of its unlocked copy, or a
// batch. Decides which screen shows and when, paces what each screen shows, and drops whatever an
// abandoned attempt's worker says late. Knows nothing about the page or workers: `main.ts` feeds in
// worker answers and user actions, and renders what this calls on `Ui`.
import { next, settled, start, type Action, type Batch, type Event as BatchEvent, type RowState, type Summary } from './batch'
import { dateForms } from './dates'
import { createPacer, realClock, type Clock } from './pace'
import type { WorkerRequest, WorkerResponse } from './unlock.worker'

export const views = ['pick', 'busy', 'unlock', 'done', 'stop', 'relock', 'batch', 'batch-done'] as const
export type View = (typeof views)[number]

// Going to a deeper view moves forward, to a shallower one back.
const depth: Record<View, number> = { pick: 0, unlock: 1, busy: 2, done: 3, stop: 3, relock: 4, batch: 2, 'batch-done': 3 }

// Work that ends within this many ms skips the Unlocking screen, so a quick answer does not flash it.
const PATIENCE = 300
// Once the Unlocking or Locking screen shows, its steps tick at least STEP_FLOOR apart, and the last
// tick shows for HOLD before Done. Date tries count TRY_FLOOR apart, adding at most TRY_CAP of wait per
// password tried. Batch rows change at least ROW_FLOOR apart, adding at most ROW_CAP per batch. Every
// floor, and the hold, is 0 under reduced motion.
const STEP_FLOOR = 350
const HOLD = 500
const TRY_FLOOR = 150
const TRY_CAP = 1000
const ROW_FLOOR = 200
const ROW_CAP = 2000

export type { Clock }

// The password prompt. `tried`: the date forms tried after the exact text, for the wrong-password line.
export type Prompt = { name: string; size: number; wrong: boolean; tried: number; batch: { at: number; of: number } | null }

export type Stop = { type: 'not-locked' | 'not-pdf'; name: string } | { type: 'failed'; text: string } | { type: 'crashed' }

export type Unlocked = Extract<WorkerResponse, { type: 'unlocked' }>

export type Ui = {
  // `direction` is null when the view already shows; it is entered again all the same.
  show(view: View, direction: 'fwd' | 'back' | null): void
  busy(kind: 'unlock' | 'lock', name: string): void
  // Step `n` is active; the ones before it are done.
  steps(n: number): void
  // The date-try counter, or none.
  trying(count: { n: number; of: number } | null): void
  ask(prompt: Prompt): void
  unlocked(outcome: Unlocked, file: { name: string; size: number }): void
  locked(pdf: Uint8Array): void
  stop(reason: Stop): void
  // Drop everything tied to the last file: typed passwords, unlocked copies.
  clear(): void
  // The set screen was left, or its lock stopped: its field empties.
  leftRelock(): void
  batch(files: File[], rows: RowState[]): void
  rows(rows: RowState[]): void
  copy(index: number, outcome: Unlocked): void
  batchDone(summary: Summary, rows: RowState[]): void
}

// `start(id)` starts a worker whose answers come back through `answer(id, …)`.
export type Work = { start(id: number): void; send(request: WorkerRequest): void; stop(): void }

type Options = { clock?: Clock; reduced?: () => boolean; today?: () => Date }

export function createAttempt(ui: Ui, work: Work, { clock = realClock, reduced = () => false, today = () => new Date() }: Options = {}) {
  let view: View = 'pick'
  // The running worker. An answer from any other is from an abandoned attempt, and is dropped.
  let worker = 0
  let file = { name: '', size: 0 }
  let step = 1
  let tried = 0
  // Locking runs after Done, so its busy and Locked screens slide in forward.
  let locking = false
  // `asked`: the file the password prompt was shown for, so a late Skip or Unlock cannot act on the next one.
  let run: { files: File[]; state: Batch; asked: number | null } | null = null
  let cancelPending = () => {}
  // The pacing lanes. Each paces what the page shows, never the work.
  const lane = (floor: number, cap?: number) => createPacer(reduced() ? 0 : floor, cap, clock)
  let steps = lane(0)
  let tries = lane(0)
  let rows = lane(0)

  function go(to: View) {
    const direction = to === view ? null : depth[to] < depth[view] && !locking ? 'back' : 'fwd'
    view = to
    ui.show(to, direction)
  }

  function wait(then: () => void, ms: number) {
    cancelPending()
    cancelPending = clock.later(then, ms)
  }

  function setSteps(n: number) {
    step = n
    ui.steps(n)
  }

  function stopWorker() {
    work.stop()
    worker++
  }

  function showBusy() {
    setSteps(step)
    go('busy')
    // Appearing is the screen's first tick, so the next update waits a step floor after it.
    steps.push(() => {})
  }

  function patience(then = showBusy) {
    ui.trying(null)
    wait(then, PATIENCE)
  }

  function clear() {
    cancelPending()
    stopWorker()
    locking = false
    run = null
    ui.clear()
  }

  function begin(kind: 'unlock' | 'lock', name: string, request: WorkerRequest) {
    steps = lane(STEP_FLOOR)
    tries = lane(TRY_FLOOR, TRY_CAP)
    ui.busy(kind, name)
    work.start(++worker)
    work.send(request)
  }

  function openFile(picked: File) {
    file = { name: picked.name || 'document.pdf', size: picked.size }
    step = 1
    begin('unlock', file.name, { type: 'open', file: picked })
  }

  // Answers before the Unlocking screen shows are not paced, so quick work never shows it. A queued
  // answer is dropped once its attempt is abandoned or another screen, such as a stop, has replaced it.
  function answer(from: number, response: WorkerResponse) {
    if (from !== worker) return
    if (run) return batchAnswer(response)
    if (view !== 'busy') return handle(response)
    const live = () => from === worker && view === 'busy'
    if (response.type === 'trying') return tries.push(() => live() && handle(response))
    tries.push(() => steps.push(() => live() && handle(response)))
  }

  function handle(response: WorkerResponse) {
    if (response.type === 'restricted') return setSteps(2)
    if (response.type === 'trying') return ui.trying({ n: response.n, of: response.of })
    cancelPending()
    if (response.type === 'needs-password' || response.type === 'wrong-password') return ask(response.type === 'wrong-password')
    stopWorker()
    switch (response.type) {
      case 'not-locked':
        return stop({ type: 'not-locked', name: file.name })
      case 'unlocked':
        ui.unlocked(response, file)
        return finish()
      case 'locked':
        ui.locked(response.pdf)
        return finish()
      case 'unreadable':
        return stop({ type: 'failed', text: response.message })
    }
  }

  function ask(wrong: boolean) {
    if (run) run.asked = run.state.at
    const batch = run && { at: run.state.at, of: run.files.length }
    ui.ask({ ...file, wrong, tried, batch })
    go('unlock')
  }

  // Lets the last step tick before leaving the Unlocking screen.
  function finish() {
    if (view !== 'busy') return go('done')
    setSteps(4)
    wait(() => go('done'), reduced() ? 0 : HOLD)
  }

  function stop(reason: Stop) {
    cancelPending()
    ui.stop(reason)
    go('stop')
  }

  function openBatch(files: File[]) {
    clear()
    const { batch: state, action } = start(files.length)
    run = { files, state, asked: null }
    rows = lane(ROW_FLOOR, ROW_CAP)
    ui.batch(files, state.rows)
    go('batch')
    // Appearing is the list's first change, so the next waits a row floor after it.
    rows.push(() => {})
    act(action)
  }

  // Only what the page shows waits: the next file starts at once. A change is dropped once its batch is gone.
  function display(update: () => void) {
    const current = run
    rows.push(() => run === current && update())
  }

  function batchAnswer(response: WorkerResponse) {
    if (response.type === 'restricted' || response.type === 'trying' || response.type === 'locked') return
    cancelPending()
    if (response.type === 'needs-password' || response.type === 'wrong-password') return batchStep({ type: response.type })
    stopWorker()
    if (response.type === 'unlocked') ui.copy(run!.state.at, response)
    batchStep({ type: response.type })
  }

  function batchStep(event: BatchEvent) {
    const current = run!
    const { batch: state, action } = next(current.state, event, today())
    current.state = state
    display(() => ui.rows(state.rows))
    act(action)
  }

  function act(action: Action) {
    const current = run!
    switch (action.type) {
      case 'open':
        display(() => go('batch'))
        return openFile(current.files[action.index])
      case 'unlock':
        tried = action.candidates.length - 1
        return work.send({ type: 'unlock', candidates: action.candidates })
      case 'ask': {
        // A Skip while this waits its turn moves the batch on; the prompt must not open for the next file.
        const stillAsked = () => current.state.at === action.index && current.state.rows[action.index] === 'needs-password'
        return display(() => stillAsked() && ask(action.wrong))
      }
      case 'done':
        return display(() => {
          ui.batchDone(action.summary, current.state.rows)
          go('batch-done')
        })
    }
  }

  function skip() {
    if (run!.asked !== run!.state.at) return
    run!.asked = null
    cancelPending()
    stopWorker()
    batchStep({ type: 'skip' })
  }

  function cancel() {
    // Cancel and Back on a batch's password prompt skip that file; the batch goes on.
    if (run && view !== 'batch-done') return skip()
    clear()
    go('pick')
  }

  // Also stops a lock that started but has not reached the busy screen yet.
  function leaveRelock() {
    cancelPending()
    stopWorker()
    locking = false
    ui.leftRelock()
    go('done')
  }

  return {
    get view() {
      return view
    },
    get locking() {
      return locking
    },
    answer,
    // The worker stopped with an error. In a batch that is the file's outcome, and the batch goes on.
    crashed(from: number) {
      if (from !== worker) return
      if (run) return batchAnswer({ type: 'unreadable', message: '' })
      stop({ type: 'crashed' })
    },
    open(files: File[]) {
      if (files.length > 1) return openBatch(files)
      clear()
      openFile(files[0])
      patience()
    },
    // Abandons the attempt in progress, so its worker cannot answer over this screen.
    notPdf(name: string) {
      clear()
      stop({ type: 'not-pdf', name })
    },
    fail(text: string) {
      stop({ type: 'failed', text })
    },
    // Returns false when the prompt was already answered, by a Skip or an earlier Unlock.
    submit(password: string, remember: boolean) {
      if (run) {
        if (run.asked !== run.state.at) return false
        patience(() => go('batch'))
        batchStep({ type: 'typed', password, remember })
        return true
      }
      step = 2
      const candidates = dateForms(password, today())
      tried = candidates.length - 1
      tries = lane(TRY_FLOOR, TRY_CAP)
      patience()
      work.send({ type: 'unlock', candidates })
      return true
    },
    retry(index: number) {
      if (run && settled(run.state)) batchStep({ type: 'retry', index })
    },
    cancel,
    back() {
      if (view === 'relock') return leaveRelock()
      cancel()
    },
    addPassword() {
      go('relock')
    },
    leaveRelock,
    lock(copy: File, password: string) {
      locking = true
      step = 2
      begin('lock', copy.name, { type: 'lock', file: copy, password })
      patience()
    },
  }
}

export type Attempt = ReturnType<typeof createAttempt>
