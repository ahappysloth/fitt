import type { ReactNode } from 'react'
import './training-lock-note.css'

/** Explain a disabled training control without repeating the session shortcut. */
export default function TrainingLockNote({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p className="training-lock-note" id={id}>
      {children}
    </p>
  )
}
