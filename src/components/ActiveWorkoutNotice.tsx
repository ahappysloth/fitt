import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from './ui'

export default function ActiveWorkoutNotice({
  children,
  onGoToWorkout,
  className = '',
}: {
  children: ReactNode
  onGoToWorkout: () => void
  className?: string
}) {
  return (
    <div className={`active-workout-notice ${className}`} role="status">
      <p>{children}</p>
      <Button variant="secondary" onClick={onGoToWorkout}>
        Go to workout <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </div>
  )
}
