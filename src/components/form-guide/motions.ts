import type { GuideMotion } from './contracts'
import { kneePushupMotion } from './knee-pushup'
import { pullupMotion } from './pull-up'
import { squatMotion } from './squat'

/**
 * Every authored 3D motion, keyed by exercise id. The studio lists all of them;
 * workouts only use those in `releasedFormGuides` (lib/form-guides.ts).
 */
export const guideMotions: Readonly<Record<string, GuideMotion>> = {
  [kneePushupMotion.id]: kneePushupMotion,
  [squatMotion.id]: squatMotion,
  [pullupMotion.id]: pullupMotion,
}
