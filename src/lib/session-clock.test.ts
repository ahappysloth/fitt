import { describe, expect, it } from 'vitest'
import { emptyState, generateWorkout, defaultProfile } from './workout'
import { sessionElapsedSeconds, toggleSessionPause } from './session-clock'
import { parseBackup } from './storage'
import type { Session } from './types'

const start = Date.parse('2026-11-01T12:00:00Z')
const session = (): Session => ({
  ...generateWorkout(defaultProfile, []),
  startedAt: new Date(start).toISOString(),
})

describe('session clock', () => {
  it('counts training time and excludes repeated pauses', () => {
    let active = session()
    active = toggleSessionPause(active, start + 30_000)
    expect(sessionElapsedSeconds(active, start + 300_000)).toBe(30)
    active = toggleSessionPause(active, start + 330_000)
    expect(sessionElapsedSeconds(active, start + 350_000)).toBe(50)
    active = toggleSessionPause(active, start + 360_000)
    active = toggleSessionPause(active, start + 420_000)
    expect(sessionElapsedSeconds(active, start + 430_000)).toBe(70)
  })
  it('retains fractional pauses without accumulating rounding drift', () => {
    let active = session()
    for (let i = 0; i < 4; i++) {
      active = toggleSessionPause(active, start + i * 1000)
      active = toggleSessionPause(active, start + i * 1000 + 250)
    }
    expect(active.pausedSeconds).toBe(1)
    expect(sessionElapsedSeconds(active, start + 5000)).toBe(4)
  })
  it('can finish while paused without counting the ongoing pause', () => {
    const active = toggleSessionPause(session(), start + 45_000)
    const finished: Session = {
      ...active,
      completedAt: new Date(start + 600_000).toISOString(),
      elapsedSeconds: sessionElapsedSeconds(active, start + 600_000),
    }
    expect(finished.elapsedSeconds).toBe(45)
    expect(sessionElapsedSeconds(finished, start + 3_600_000)).toBe(45)
    expect(toggleSessionPause(finished)).toEqual(finished)
  })
  it('round-trips paused state and rejects corrupt timing metadata', () => {
    const state = emptyState()
    state.active = toggleSessionPause(session(), start + 15_000)
    state.active.pausedSeconds = 2.25
    expect(parseBackup(JSON.stringify(state)).active).toEqual(state.active)
    for (const patch of [
      { pausedAt: 'invalid' },
      { pausedSeconds: -1 },
      { pausedAt: new Date(start - 1).toISOString() },
    ]) {
      expect(() =>
        parseBackup(JSON.stringify({ ...state, active: { ...state.active, ...patch } })),
      ).toThrow()
    }
  })
  it('bounds elapsed time after clock changes or a long absence', () => {
    expect(sessionElapsedSeconds(session(), start - 1000)).toBe(0)
    expect(sessionElapsedSeconds(session(), start + 999_999_999)).toBe(604800)
  })
})
