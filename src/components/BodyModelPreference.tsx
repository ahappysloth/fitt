'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { BodyModel } from '../lib/types'

export interface BodyModelPreferenceValue {
  bodyModel: BodyModel
  onBodyModelChange?: (bodyModel: BodyModel) => void
}

const BodyModelPreferenceContext = createContext<BodyModelPreferenceValue>({ bodyModel: 'male' })

export function BodyModelPreferenceProvider({
  value,
  children,
}: {
  value: BodyModelPreferenceValue
  children: ReactNode
}) {
  return (
    <BodyModelPreferenceContext.Provider value={value}>
      {children}
    </BodyModelPreferenceContext.Provider>
  )
}

export function useBodyModelPreference(): BodyModelPreferenceValue {
  return useContext(BodyModelPreferenceContext)
}
