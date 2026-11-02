import type { ReactNode } from 'react'
import FittClient from '../FittClient'

export default function TrainingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <FittClient />
      {children}
    </>
  )
}
