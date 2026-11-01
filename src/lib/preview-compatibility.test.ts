import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultProfile, generateWorkout, uid } from './workout'
import { loadState } from './storage'

afterEach(() => vi.unstubAllGlobals())

describe('restricted preview compatibility', () => {
  it('can create workouts without the secure-context-only randomUUID API', () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto)
    vi.stubGlobal('crypto', { getRandomValues })
    const workout = generateWorkout(defaultProfile, [])
    const ids = [workout.id, ...workout.exercises.flatMap((e) => e.sets.map((s) => s.id)), uid()]
    expect(new Set(ids).size).toBe(ids.length)
    expect(
      ids.every((id) =>
        /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(id),
      ),
    ).toBe(true)
  })

  it('offers an in-memory session when a preview blocks localStorage', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('Opaque origin', 'SecurityError')
      },
    })
    const loaded = loadState()
    expect(loaded.state.history).toEqual([])
    expect(loaded.error).toContain('This preview cannot save data')
  })

  it('still protects malformed saved data instead of treating it as temporary storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{malformed' })
    expect(loadState().error).toContain('Automatic saving is paused to protect it')
  })
})
