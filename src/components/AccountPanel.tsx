'use client'

import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Check,
  Cloud,
  CloudCheck,
  Download,
  Laptop,
  LoaderCircle,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
  WifiOff,
} from 'lucide-react'
import type { AccountController, AccountStatus } from '../lib/cloud/types'
import Modal from './Modal'
import { Button } from './ui'
import './account.css'

type AccountDialog = 'import' | 'sign-out' | 'conflict' | null

const statusLabels: Record<AccountStatus, string> = {
  checking: 'Checking your account',
  guest: 'On this device',
  loading: 'Syncing your progress',
  synced: 'Up to date',
  pending: 'Changes waiting to sync',
  offline: 'Offline',
  conflict: 'Review your changes',
  expired: 'Sign in again',
  error: 'Needs attention',
  unavailable: 'On this device',
}

function syncDetail(account: AccountController) {
  if (!account.storageAvailable)
    return 'Sync is paused because this browser cannot save your changes. Export a backup below to keep your progress.'
  if (account.status === 'expired')
    return 'Your sign-in has expired. Sign in to the same account to sync the progress saved on this device.'
  if (account.conflict)
    return 'Some changes overlap with another device. Choose which version to keep; other changes will be combined.'
  if (!account.online)
    return account.pendingCount
      ? 'Your changes are saved on this device. They will sync when you reconnect.'
      : 'You can keep training here. Fitt will check for updates when you reconnect.'
  if (account.pendingCount)
    return 'Your latest changes are saved on this device and waiting to reach your account.'
  if (account.status === 'loading')
    return 'Bringing your saved workouts and preferences up to date.'
  if (account.status === 'error') return 'Your progress is still available here. Try syncing again.'
  return 'Completed workouts, saved routines, and preferences follow you across your devices.'
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.8 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.5a4.7 4.7 0 0 1-2.1 3.1v2.6h3.4c2-1.9 3-4.4 3-7.6Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.8 0 5.1-.9 6.8-2.5l-3.4-2.6c-.9.6-2 1-3.4 1a6 6 0 0 1-5.7-4.2H2.8v2.7A10.3 10.3 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.3 13.7a6.2 6.2 0 0 1 0-3.4V7.6H2.8a10.4 10.4 0 0 0 0 8.8l3.5-2.7Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.1c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.9 9.9 0 0 0 12 2a10.3 10.3 0 0 0-9.2 5.6l3.5 2.7A6 6 0 0 1 12 6.1Z"
      />
    </svg>
  )
}

export default function AccountPanel({ account }: { account: AccountController }) {
  const titleId = useId()
  const emailId = useId()
  const emailHintId = useId()
  const [email, setEmail] = useState('')
  const [dialog, setDialog] = useState<AccountDialog>(null)
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const busy = account.busy || working
  const error = actionError || account.error
  const showSignIn = !account.user || account.status === 'expired'
  const providersAvailable = account.providers.google || account.providers.magicLink
  const checking = account.status === 'checking'
  const status =
    !account.online && account.status !== 'unavailable' ? 'Offline' : statusLabels[account.status]
  const importedItems = `${account.guestWorkoutCount} ${account.guestWorkoutCount === 1 ? 'workout' : 'workouts'} and ${account.guestRoutineCount} ${account.guestRoutineCount === 1 ? 'saved routine' : 'saved routines'}`
  const syncedDate = account.lastSyncedAt ? new Date(account.lastSyncedAt) : null
  const syncedAt = syncedDate && !Number.isNaN(syncedDate.getTime()) ? syncedDate : null

  useEffect(() => {
    if (dialog === 'conflict' && !account.conflict) setDialog(null)
    if (dialog === 'sign-out' && !account.user) setDialog(null)
  }, [dialog, account.conflict, account.user])

  async function run(action: () => Promise<boolean | void>, closeAfter = false) {
    if (busy) return
    setWorking(true)
    setActionError(null)
    try {
      const succeeded = await action()
      if (closeAfter && succeeded === true) setDialog(null)
    } catch {
      setActionError('We couldn’t finish that action. Please try again.')
    } finally {
      setWorking(false)
    }
  }

  function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(() => account.requestMagicLink(email.trim()))
  }

  function closeDialog() {
    if (!busy) setDialog(null)
  }

  function requestSignOut() {
    if (account.pendingCount || account.conflict) setDialog('sign-out')
    else void run(() => account.signOut())
  }

  return (
    <section className="panel account-panel" aria-labelledby={titleId}>
      <div className="account-intro">
        <span className="account-symbol" aria-hidden="true">
          <Cloud size={25} strokeWidth={1.65} />
          <span>
            <Check size={10} strokeWidth={3} />
          </span>
        </span>
        <div className="account-title">
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h2 id={titleId}>
            {account.user ? 'Progress that goes with you.' : 'Your progress, everywhere.'}
          </h2>
          <p>
            {account.user
              ? 'Pick up where you left off, wherever you train.'
              : 'Save your progress across devices. No password to remember.'}
          </p>
        </div>
        <span
          className={`account-status ${account.conflict || account.status === 'error' || account.status === 'expired' ? 'needs-attention' : ''}`}
          role="status"
        >
          {!account.online ? (
            <WifiOff size={14} aria-hidden="true" />
          ) : checking || account.status === 'loading' ? (
            <LoaderCircle size={14} className="account-spinner" aria-hidden="true" />
          ) : account.status === 'synced' ? (
            <CloudCheck size={15} aria-hidden="true" />
          ) : (
            <span className="account-status-dot" aria-hidden="true" />
          )}
          {status}
        </span>
      </div>

      {account.hasActiveWorkout && (
        <p className="account-session-notice" role="status">
          Finish or discard your workout before changing accounts or importing device progress.
        </p>
      )}

      {account.user && (
        <div className="account-member">
          <div className="account-identity">
            <span className="account-avatar" aria-hidden="true">
              {(account.user.name.trim() || account.user.email).slice(0, 1).toLocaleUpperCase()}
            </span>
            <div>
              <strong>{account.user.name.trim() || 'Your Fitt account'}</strong>
              <span>{account.user.email}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="account-sign-out"
            onClick={requestSignOut}
            disabled={busy || !account.online || account.hasActiveWorkout}
          >
            <LogOut size={15} aria-hidden="true" />
            Sign out
          </Button>
          <div className="account-sync-detail" aria-live="polite">
            <p>{syncDetail(account)}</p>
            {syncedAt && (
              <span className="account-last-synced">
                Last synced{' '}
                <time dateTime={syncedAt.toISOString()}>
                  {syncedAt.toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </time>
              </span>
            )}
          </div>
          {!showSignIn && (
            <div className="account-sync-actions">
              {account.conflict ? (
                <Button onClick={() => setDialog('conflict')} disabled={busy}>
                  Review changes <ArrowRight size={16} aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => void run(account.syncNow)}
                  disabled={busy || !account.online || !account.storageAvailable}
                >
                  <RefreshCw
                    size={15}
                    className={busy ? 'account-spinner' : ''}
                    aria-hidden="true"
                  />
                  {busy ? 'Syncing…' : 'Sync now'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {showSignIn && (
        <div className="account-signin-area">
          <div className="account-benefits">
            <div>
              <Smartphone size={18} aria-hidden="true" />
              <span>
                <strong>Train on your terms.</strong> Keep using Fitt without an account.
              </span>
            </div>
            <div>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                <strong>You choose what moves.</strong> Your device history is only imported when
                you ask.
              </span>
            </div>
          </div>
          <div className="account-signin">
            {checking ? (
              <p className="account-availability" role="status">
                Checking sign-in options…
              </p>
            ) : !providersAvailable || account.status === 'unavailable' ? (
              <div className="account-availability">
                <Laptop size={22} aria-hidden="true" />
                <strong>Keep your momentum here.</strong>
                <p>
                  Accounts aren’t available here right now. You can keep training on this device and
                  export a backup below.
                </p>
                {account.status === 'error' && (
                  <Button
                    variant="ghost"
                    onClick={() => void run(account.refreshSession)}
                    disabled={busy || !account.online}
                  >
                    Check again <RefreshCw size={14} aria-hidden="true" />
                  </Button>
                )}
              </div>
            ) : (
              <>
                {account.providers.google && (
                  <Button
                    variant="secondary"
                    className="account-google"
                    onClick={() => void run(account.signInGoogle)}
                    disabled={busy || !account.online || account.hasActiveWorkout}
                  >
                    <GoogleMark />
                    Continue with Google
                  </Button>
                )}
                {account.providers.google && account.providers.magicLink && (
                  <p className="account-divider">
                    <span>or use email</span>
                  </p>
                )}
                {account.providers.magicLink && (
                  <form className="account-email-form" onSubmit={requestLink}>
                    <label htmlFor={emailId}>Email address</label>
                    <input
                      id={emailId}
                      name="accountEmail"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={254}
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={busy || !account.online || account.hasActiveWorkout}
                      aria-describedby={emailHintId}
                    />
                    <Button
                      type="submit"
                      disabled={busy || !account.online || account.hasActiveWorkout}
                    >
                      {busy ? (
                        <LoaderCircle className="account-spinner" size={16} aria-hidden="true" />
                      ) : (
                        <Mail size={16} aria-hidden="true" />
                      )}
                      {busy ? 'Please wait…' : 'Send a sign-in link'}
                    </Button>
                    <p id={emailHintId} className="account-form-hint">
                      Open the email link to sign in or create your account.
                    </p>
                  </form>
                )}
                {!account.online && (
                  <p className="account-form-hint">
                    Connect to the internet to sign in. You can keep training here.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {account.user && account.canImport && (
        <div className="account-import">
          <span className="account-import-icon" aria-hidden="true">
            <Upload size={20} />
          </span>
          <div>
            <h3>Bring this device’s progress along.</h3>
            <p>{importedItems} available to add. Your account preferences stay as they are.</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setDialog('import')}
            disabled={
              busy ||
              !account.storageAvailable ||
              !!account.conflict ||
              account.status === 'expired' ||
              account.hasActiveWorkout
            }
          >
            Import device progress <ArrowRight size={15} aria-hidden="true" />
          </Button>
        </div>
      )}

      {error && !dialog && (
        <p className="account-feedback account-error" role="alert">
          {error}
        </p>
      )}
      {account.message && !error && (
        <div className="account-feedback account-success" role="status">
          <Check size={17} aria-hidden="true" />
          <p>{account.message}</p>
          {showSignIn && (
            <Button
              variant="ghost"
              onClick={() => void run(account.refreshSession)}
              disabled={busy || !account.online}
            >
              Check sign-in status <ArrowRight size={14} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}

      {dialog === 'import' && (
        <Modal title="Add this device’s progress?" onClose={closeDialog}>
          <div className="account-dialog-copy">
            <p>
              Add <strong>{importedItems}</strong> to your signed-in account.
            </p>
            <ul>
              <li>Matching workouts and routines won’t be duplicated.</li>
              <li>Your account preferences stay as they are.</li>
              <li>Your device-only history stays available when you sign out.</li>
            </ul>
            <p className="account-dialog-note">
              Active workouts stay on the device where you started them.
            </p>
          </div>
          {error && (
            <p className="account-feedback account-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions account-dialog-actions">
            <Button variant="secondary" onClick={closeDialog} disabled={busy}>
              Not now
            </Button>
            <Button
              onClick={() => void run(account.importGuestData, true)}
              disabled={busy || account.hasActiveWorkout}
            >
              {busy ? 'Adding progress…' : 'Add to my account'}
            </Button>
          </div>
        </Modal>
      )}

      {dialog === 'sign-out' && (
        <Modal title="Some progress hasn’t synced yet." onClose={closeDialog}>
          <div className="account-dialog-copy">
            <p>
              You can stay signed in to finish syncing, or sign out and keep these changes on this
              device.
            </p>
            <p>
              The saved changes stay linked to <strong>{account.user?.email}</strong>. Sign back in
              to that same account on this device to finish syncing them.
            </p>
            <p className="account-dialog-note">
              They won’t appear in another account or in device-only mode. Don’t clear this
              browser’s data before they sync.
            </p>
          </div>
          {error && (
            <p className="account-feedback account-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions account-dialog-actions">
            <Button variant="secondary" onClick={closeDialog} disabled={busy}>
              Stay signed in
            </Button>
            <Button
              onClick={() => void run(() => account.signOut({ keepPending: true }), true)}
              disabled={busy || account.hasActiveWorkout}
            >
              {busy ? 'Signing out…' : 'Keep changes and sign out'}
            </Button>
          </div>
        </Modal>
      )}

      {dialog === 'conflict' && account.conflict && (
        <Modal title="Choose which changes to keep." onClose={closeDialog}>
          <div className="account-dialog-copy">
            <p>These changed here and on another device:</p>
            <ul>
              {account.conflict.fields.map((field) => (
                <li key={field}>{field}</li>
              ))}
            </ul>
            <p>
              Your choice applies only to these overlapping changes. Other updates from both devices
              will be kept.
            </p>
            <Button
              variant="ghost"
              className="account-conflict-backup"
              onClick={account.exportConflictBackup}
              disabled={busy}
            >
              <Download size={16} aria-hidden="true" /> Export both versions first
            </Button>
          </div>
          <div className="account-conflict-choices">
            <Button
              variant="secondary"
              onClick={() => void run(() => account.resolveConflict('local'))}
              disabled={busy || !account.storageAvailable}
            >
              <Laptop size={20} aria-hidden="true" />
              <span>
                Keep this device’s changes<small>Use the overlapping edits saved here.</small>
              </span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void run(() => account.resolveConflict('remote'))}
              disabled={busy || !account.storageAvailable}
            >
              <Cloud size={20} aria-hidden="true" />
              <span>
                Use the account’s changes<small>Use the overlapping edits saved online.</small>
              </span>
            </Button>
          </div>
          {error && (
            <p className="account-feedback account-error" role="alert">
              {error}
            </p>
          )}
          <Button
            variant="ghost"
            className="account-conflict-later"
            onClick={closeDialog}
            disabled={busy}
          >
            Decide later
          </Button>
        </Modal>
      )}
    </section>
  )
}
