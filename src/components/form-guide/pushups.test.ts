import { expect, it } from 'vitest'
import { pushupMotions } from './pushups'
for (const motion of pushupMotions) {
  it(`${motion.id} preserves arm lengths and the loop`, () => {
    const first = motion.sample(0)
    for (let i = 0; i <= 100; i++) {
      const frame = motion.sample(i / 100)
      for (let side = 0; side < 2; side++) {
        expect(frame.shoulders[side].distanceTo(frame.elbows[side])).toBeCloseTo(
          first.shoulders[side].distanceTo(first.elbows[side]),
          9,
        )
        expect(frame.wrists[side].distanceTo(frame.elbows[side])).toBeCloseTo(
          first.wrists[side].distanceTo(first.elbows[side]),
          9,
        )
        expect(frame.wrists[side].distanceTo(first.wrists[side])).toBe(0)
        if (i === 100) expect(frame.shoulders[side].distanceTo(first.shoulders[side])).toBe(0)
      }
    }
  })
}
