import { env, waitUntil } from 'cloudflare:workers'
import { createWorkerMailSender } from './email-worker'
import type { FittEnv } from './env'

/** Native bindings and request lifetime; never loaded by the Node test runtime. */
export function getWorkerContext() {
  const bindings = env as unknown as Record<string, unknown> & Partial<FittEnv>
  return {
    env: { ...bindings, __FITT_SEND_EMAIL: createWorkerMailSender(bindings) },
    // This native function follows the current request, including its async
    // continuations. It keeps authentication work and pool.end() alive.
    waitUntil,
  }
}
