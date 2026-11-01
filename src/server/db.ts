import { createDb } from '@turnal-io/db/serverless'
import * as schema from '../db/schema'
import { isWorkerRuntime } from './runtime'

export type ServerDb = ReturnType<typeof createDb<typeof schema>>['db']

export async function createRequestDb(connectionString: string) {
  const target = new URL(connectionString)
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !target.hostname.endsWith('.neon.tech') ||
    !target.hostname.includes('-pooler.')
  ) {
    throw new Error('A pooled Neon database connection is required')
  }
  if (!isWorkerRuntime()) await (await import('./db-node')).configureNodeDatabase()
  const { db, pool } = createDb({ schema, connectionString, max: 1, connectionTimeoutMs: 8_000 })
  ;(pool as unknown as { options: { query_timeout: number } }).options.query_timeout = 15_000
  pool.on('error', () => console.error('[Fitt] Database connection interrupted'))
  let closed = false
  return {
    db,
    pool,
    async dispose() {
      if (closed) return
      closed = true
      await pool.end()
    },
  }
}
