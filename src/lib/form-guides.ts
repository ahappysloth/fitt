/**
 * Exercises whose 3D form guide is released to workouts and exercise details.
 * Kept free of three.js so the main bundle can check availability cheaply; the
 * motions themselves live in components/form-guide/motions.ts and load lazily.
 * Exercises not listed keep their illustrated guide.
 */
export const releasedFormGuides: ReadonlySet<string> = new Set(['knee-pushup', 'squat', 'pullup'])
