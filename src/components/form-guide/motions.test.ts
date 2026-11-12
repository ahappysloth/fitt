import { describe, expect, it } from 'vitest'
import { guideMotions } from './motions'

describe('registered guide motions', () => {
  it.each(Object.values(guideMotions).map((motion) => [motion.id, motion] as const))(
    '%s only reports phases from its own phase list',
    (_, motion) => {
      // The viewer numbers the phase badge by its index in `phases`; an unknown name shows "00".
      for (let step = 0; step <= 100; step++)
        expect(motion.phases).toContain(motion.describe(step / 100).phase)
    },
  )
})
