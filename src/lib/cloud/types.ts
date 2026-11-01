export interface AccountUser {
  id: string
  name: string
  email: string
}

export type AccountStatus =
  | 'checking'
  | 'guest'
  | 'loading'
  | 'synced'
  | 'pending'
  | 'offline'
  | 'conflict'
  | 'expired'
  | 'error'
  | 'unavailable'

export interface AccountController {
  user: AccountUser | null
  providers: { google: boolean; magicLink: boolean }
  status: AccountStatus
  busy: boolean
  online: boolean
  error: string | null
  message: string | null
  pendingCount: number
  lastSyncedAt: string | null
  guestWorkoutCount: number
  guestRoutineCount: number
  canImport: boolean
  conflict: { fields: string[] } | null
  storageAvailable: boolean
  hasActiveWorkout: boolean
  /** Initial navigation only; this URL hint never identifies or authenticates a user. */
  returnToAccount?: boolean
  signInGoogle(): Promise<boolean>
  requestMagicLink(email: string): Promise<boolean>
  refreshSession(): Promise<void>
  importGuestData(): Promise<boolean>
  syncNow(): Promise<void>
  resolveConflict(choice: 'local' | 'remote'): Promise<boolean>
  /** Keep unsynced work in this account's local cache only after confirmation. */
  signOut(options?: { keepPending?: boolean }): Promise<boolean>
  exportConflictBackup(): void
}

export interface AccountResponse {
  user: AccountUser | null
  providers: { google: boolean; magicLink: boolean }
  realtime: boolean
}
