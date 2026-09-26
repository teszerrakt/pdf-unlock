import { describe, expect, it } from 'vitest'
import { next, rowText, start, summary, type Action, type Event, type RowState } from './batch'
import { dateForms } from './dates'

const today = new Date(2026, 8, 26, 12)

function run(count: number, events: Event[]) {
  let { batch, action } = start(count)
  const actions: Action[] = [action]
  for (const event of events) {
    ;({ batch, action } = next(batch, event, today))
    actions.push(action)
  }
  return { batch, actions, last: action }
}

const typed = (password: string, remember = true): Event => ({ type: 'typed', password, remember })

describe('a batch', () => {
  it('attempts three files in pick order, each only after the one before reached an outcome or was skipped', () => {
    const { actions } = run(3, [{ type: 'unlocked' }, { type: 'needs-password' }, { type: 'skip' }, { type: 'not-locked' }])
    expect(actions.map((action) => action.type === 'open' && action.index)).toEqual([0, 1, false, 2, false])
    expect(run(3, [{ type: 'unlocked' }]).batch.rows).toEqual<RowState[]>(['unlocked', 'unlocking', 'waiting'])
  })

  it('tries a password typed with the checkbox on, and its date forms, on the next file before asking', () => {
    const { actions } = run(2, [{ type: 'needs-password' }, typed('900805'), { type: 'unlocked' }, { type: 'needs-password' }, { type: 'wrong-password' }])
    expect(actions[2]).toEqual({ type: 'unlock', index: 0, candidates: dateForms('900805', today) })
    expect(actions[4]).toEqual({ type: 'unlock', index: 1, candidates: dateForms('900805', today) })
    // They all missed: the prompt, not marked wrong, since nothing was typed for this file.
    expect(actions[5]).toEqual({ type: 'ask', index: 1, wrong: false })
  })

  it('asks at once on the next file when the checkbox was off', () => {
    const { last } = run(2, [{ type: 'needs-password' }, typed('secret', false), { type: 'unlocked' }, { type: 'needs-password' }])
    expect(last).toEqual({ type: 'ask', index: 1, wrong: false })
  })

  it('forgets the remembered password once one is typed with the checkbox off', () => {
    const { last } = run(3, [
      { type: 'needs-password' },
      typed('first'),
      { type: 'unlocked' },
      { type: 'needs-password' },
      { type: 'wrong-password' },
      typed('second', false),
      { type: 'unlocked' },
      { type: 'needs-password' },
    ])
    expect(last).toEqual({ type: 'ask', index: 2, wrong: false })
  })

  it('remembers only a password that worked', () => {
    const { last } = run(2, [{ type: 'needs-password' }, typed('nope'), { type: 'wrong-password' }, { type: 'skip' }, { type: 'needs-password' }])
    expect(last).toEqual({ type: 'ask', index: 1, wrong: false })
  })

  it('marks the prompt wrong when a typed password misses', () => {
    const { last } = run(2, [{ type: 'needs-password' }, typed('nope')])
    expect(last.type).toBe('unlock')
    expect(run(2, [{ type: 'needs-password' }, typed('nope'), { type: 'wrong-password' }]).last).toEqual({ type: 'ask', index: 0, wrong: true })
  })

  it('marks a skipped file skipped and starts the next', () => {
    const { batch, last } = run(2, [{ type: 'needs-password' }, { type: 'skip' }])
    expect(batch.rows).toEqual<RowState[]>(['skipped', 'unlocking'])
    expect(last).toEqual({ type: 'open', index: 1 })
  })

  it('reopens a skipped file on Try again, then ends with the summary again', () => {
    const { batch, actions } = run(2, [{ type: 'needs-password' }, { type: 'skip' }, { type: 'unlocked' }, { type: 'retry', index: 0 }, { type: 'needs-password' }, typed('secret'), { type: 'unlocked' }])
    expect(actions[4]).toEqual({ type: 'open', index: 0 })
    expect(batch.rows).toEqual<RowState[]>(['unlocked', 'unlocked'])
    expect(actions.at(-1)).toMatchObject({ type: 'done', summary: { title: '2 of 2 unlocked.' } })
  })

  it('ends with the summary once every file has an outcome', () => {
    const { last } = run(4, [{ type: 'unlocked' }, { type: 'unlocked' }, { type: 'not-locked' }, { type: 'needs-password' }, { type: 'skip' }])
    expect(last).toEqual({
      type: 'done',
      summary: { title: '2 of 4 unlocked.', lede: 'One file had no password to remove. One was skipped.', unlocked: 2 },
    })
  })
})

describe('summary', () => {
  it('says every copy opens anywhere when all were unlocked', () => {
    expect(summary(['unlocked', 'unlocked'])).toEqual({ title: '2 of 2 unlocked.', lede: 'Every copy opens anywhere, no password needed.', unlocked: 2 })
  })

  it('uses the plural forms', () => {
    const rows: RowState[] = ['unlocked', 'not-locked', 'not-locked', 'skipped', 'skipped']
    expect(summary(rows).lede).toBe('2 files had no password to remove. 2 were skipped.')
  })

  it('counts files that could not be read, between not locked and skipped', () => {
    expect(summary(['unlocked', 'unreadable', 'skipped']).lede).toBe('One could not be read. One was skipped.')
    expect(summary(['not-locked', 'unreadable', 'unreadable']).lede).toBe('One file had no password to remove. 2 could not be read.')
  })
})

describe('rowText', () => {
  it('names each row state', () => {
    const states: RowState[] = ['waiting', 'unlocking', 'needs-password', 'unlocked', 'not-locked', 'unreadable', 'skipped']
    expect(states.map((state) => rowText[state])).toEqual(['Waiting', 'Unlocking…', 'Needs password', 'Unlocked', 'Not locked', 'Unreadable', 'Skipped'])
  })
})
