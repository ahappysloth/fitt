import type { GuideMotion } from './contracts'
import { kneePushupMotion } from './knee-pushup'
import { pullupMotion } from './pull-up'
import { squatMotion } from './squat'
import { pushupMotions } from './pushups'

/**
 * Every authored 3D motion, keyed by exercise id. The studio lists all of them;
 * workouts only use those in `releasedFormGuides` (lib/form-guides.ts).
 */
export const guideMotions: Readonly<Record<string, GuideMotion>> = {
  [kneePushupMotion.id]: kneePushupMotion,
  [squatMotion.id]: squatMotion,
  [pullupMotion.id]: pullupMotion,
  ...Object.fromEntries(pushupMotions.map((motion) => [motion.id, motion])),
}
