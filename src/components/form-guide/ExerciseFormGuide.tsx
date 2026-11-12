'use client'

import type { ReactNode } from 'react'
import { FormGuide } from './FormGuide'
import { guideMotions } from './motions'

/** The 3D guide for any exercise with an authored motion, or the fallback without one. */
export default function ExerciseFormGuide({
  exerciseId,
  fallback,
}: {
  exerciseId: string
  fallback: ReactNode
}) {
  const motion = guideMotions[exerciseId]
  if (!motion) return <>{fallback}</>
  return <FormGuide key={motion.id} motion={motion} fallback={fallback} />
}
