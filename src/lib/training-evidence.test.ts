import { describe, expect, it } from 'vitest'
import { hasReportedEffort, orderedHistory } from './training-evidence'
import type { Session } from './types'

const session = (id: string, completedAt = '2026-10-01T12:00:00Z'): Session => ({
  id,
  completedAt,
  createdAt: completedAt,
  startedAt: completedAt,
  title: 'Test',
  duration: 30,
  exercises: [],
})

describe('evidence boundaries', () => {
  it('distinguishes legacy choices from explicitly unconfirmed ratings', () => {
    expect(hasReportedEffort({ effort: 'good' })).toBe(false)
    expect(hasReportedEffort({ effort: 'good', effortConfirmed: true })).toBe(true)
    for (const effort of ['easy', 'hard'] as const) {
      expect(hasReportedEffort({ effort })).toBe(true)
      expect(hasReportedEffort({ effort, effortConfirmed: false })).toBe(false)
    }
  })

  it('orders equal completion timestamps consistently regardless of import order', () => {
    const a = session('a')
    const b = session('b')
    expect(orderedHistory([a, b]).map((entry) => entry.id)).toEqual(['b', 'a'])
    expect(orderedHistory([b, a])).toEqual(orderedHistory([a, b]))
  })

  it('deduplicates identities after chronology sorting and excludes invalid dates', () => {
    const old = session('same')
    const corrected = session('same', '2026-10-02T12:00:00Z')
    const other = session('other')
    expect(orderedHistory([corrected, old, other, session('invalid', 'bad')])).toEqual([
      corrected,
      other,
    ])
  })
})
