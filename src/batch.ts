// Runs a batch (see Batch in CONTEXT.md): which file goes next, when the remembered password is
// tried, and what the end screen says. Knows nothing about workers or the page.
import { dateForms, type Candidate } from './dates'

export type RowState = 'waiting' | 'unlocking' | 'needs-password' | 'unlocked' | 'not-locked' | 'unreadable' | 'skipped'

export type Batch = {
  rows: RowState[]
  // The file being worked on.
  at: number
  // A password that unlocked an earlier file with the checkbox on; tried first on each file that needs one.
  remembered: string | null
  // The password the running unlock tries, when the user typed it rather than it being remembered.
  typed: { password: string; remember: boolean } | null
}

// What happened to the file being worked on, or what the user did.
export type Event =
  | { type: 'needs-password' | 'wrong-password' | 'unlocked' | 'not-locked' | 'unreadable' | 'skip' }
  | { type: 'typed'; password: string; remember: boolean }
  | { type: 'retry'; index: number }

// What the page does next.
export type Action =
  | { type: 'open'; index: number }
  | { type: 'unlock'; index: number; candidates: Candidate[] }
  | { type: 'ask'; index: number; wrong: boolean }
  | { type: 'done'; summary: Summary }

export type Summary = { title: string; lede: string; unlocked: number }

const texts: Record<RowState, string> = {
  waiting: 'Waiting',
  unlocking: 'Unlocking…',
  'needs-password': 'Needs password',
  unlocked: 'Unlocked',
  'not-locked': 'Not locked',
  unreadable: 'Unreadable',
  skipped: 'Skipped',
}

export const rowText = (state: RowState) => texts[state]

export function start(count: number): { batch: Batch; action: Action } {
  const rows = Array.from({ length: count }, (_, i): RowState => (i ? 'waiting' : 'unlocking'))
  return { batch: { rows, at: 0, remembered: null, typed: null }, action: { type: 'open', index: 0 } }
}

export function next(batch: Batch, event: Event, today = new Date()): { batch: Batch; action: Action } {
  const rows = [...batch.rows]
  const { at, remembered, typed } = batch
  const set = (state: RowState, changes: Partial<Batch> = {}) => ((rows[at] = state), { ...batch, rows, ...changes })
  switch (event.type) {
    case 'needs-password':
      if (remembered === null) return { batch: set('needs-password'), action: { type: 'ask', index: at, wrong: false } }
      return { batch: set('unlocking', { typed: null }), action: { type: 'unlock', index: at, candidates: dateForms(remembered, today) } }
    case 'typed': {
      const { password, remember } = event
      const changes = { typed: { password, remember }, remembered: remember ? remembered : null }
      return { batch: set('unlocking', changes), action: { type: 'unlock', index: at, candidates: dateForms(password, today) } }
    }
    case 'wrong-password':
      // Marked wrong only when the user typed the password that missed.
      return { batch: set('needs-password', { typed: null }), action: { type: 'ask', index: at, wrong: typed !== null } }
    case 'retry':
      rows[event.index] = 'unlocking'
      return { batch: { ...batch, rows, at: event.index, typed: null }, action: { type: 'open', index: event.index } }
    case 'unlocked':
      return advance(set('unlocked', { typed: null, remembered: typed?.remember ? typed.password : remembered }))
    case 'skip':
      return advance(set('skipped', { typed: null }))
    default:
      return advance(set(event.type))
  }
}

// Starts the first file still waiting, in pick order, or ends the batch.
function advance(batch: Batch): { batch: Batch; action: Action } {
  const index = batch.rows.indexOf('waiting')
  if (index < 0) return { batch, action: { type: 'done', summary: summary(batch.rows) } }
  const rows = [...batch.rows]
  rows[index] = 'unlocking'
  return { batch: { ...batch, rows, at: index }, action: { type: 'open', index } }
}

const count = (n: number) => (n === 1 ? 'One' : String(n))

export function summary(rows: RowState[]): Summary {
  const unlocked = rows.filter((state) => state === 'unlocked').length
  const title = `${unlocked} of ${rows.length} unlocked.`
  if (unlocked === rows.length) return { title, lede: 'Every copy opens anywhere, no password needed.', unlocked }
  const n = (state: RowState) => rows.filter((s) => s === state).length
  const notLocked = n('not-locked')
  const unreadable = n('unreadable')
  const skipped = n('skipped')
  const parts = [
    notLocked && `${count(notLocked)} ${notLocked === 1 ? 'file' : 'files'} had no password to remove.`,
    unreadable && `${count(unreadable)} could not be read.`,
    skipped && `${count(skipped)} ${skipped === 1 ? 'was' : 'were'} skipped.`,
  ]
  return { title, lede: parts.filter(Boolean).join(' '), unlocked }
}
