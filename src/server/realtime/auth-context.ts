import {
  getRequestStateAsyncLocalStorage,
  getCurrentAuthContextAsyncLocalStorage,
  getCurrentDBAdapterAsyncLocalStorage,
} from '@better-auth/core/context'

// Better Auth 1.6 lazily creates these three separate singletons. Await once at
// isolate startup to prevent concurrent cold requests from replacing each
// other's ALS instance. Public API, matching Juno's pinned-version workaround.
export const authContextReady = Promise.all([
  getRequestStateAsyncLocalStorage(),
  getCurrentAuthContextAsyncLocalStorage(),
  getCurrentDBAdapterAsyncLocalStorage(),
])
