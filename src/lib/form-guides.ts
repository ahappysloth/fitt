/**
 * Exercises whose 3D form guide is released to workouts and exercise details.
 * Kept free of three.js so the main bundle can check availability cheaply; the
 * motions themselves live in components/form-guide/motions.ts and load lazily.
 * Exercises not listed keep their illustrated guide.
 */
export const releasedFormGuides: ReadonlySet<string> = new Set([
  'knee-pushup',
  'squat',
  'pullup',
  'wall-pushup',
  'incline-pushup',
  'pushup',
  'diamond-pushup',
  'ring-pushup',
  'negative-pullup',
  'assisted-pullup',
  'prone-pulldown',
  'reverse-snow-angel',
  'band-row',
  'ring-row',
  'low-ring-row',
  'reverse-lunge',
  'split-squat',
  'glute-bridge',
  'single-leg-bridge',
])
