import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import type { MigrationMeta } from 'drizzle-orm/migrator'
import { createRequestDb } from './db'
import { applyMigrations, MigrationHistoryError } from './migrations'

function migration(folderMillis: number, statements: string[]): MigrationMeta {
  return {
    folderMillis,
    sql: statements,
    bps: true,
    hash: createHash('sha256').update(statements.join('--> statement-breakpoint')).digest('hex'),
  }
}

describe.runIf(process.env.FITT_RUN_LIVE_DB_TESTS === '1')('pooled migration transactions', () => {
  let resource: Awaited<ReturnType<typeof createRequestDb>>
  let peer: Awaited<ReturnType<typeof createRequestDb>>
  const fixtureSchemas: string[] = []

  function fixture() {
    const name = `fitt_migration_test_${crypto.randomUUID().replaceAll('-', '')}`
    fixtureSchemas.push(name)
    const table = `"${name}".probe`
    const record = (step: number) => `INSERT INTO ${table}
      SELECT ${step}, pg_backend_pid(), txid_current(), EXISTS (
        SELECT 1 FROM pg_locks
        WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND granted AND objid = 1742871917
      )`
    const first = migration(1, [
      `CREATE TABLE ${table} (step integer PRIMARY KEY, backend_pid integer, transaction_id bigint, lock_held boolean)`,
      record(1),
      'SELECT pg_sleep(0.3)',
      record(2),
    ])
    return { name, table, record, first, options: { migrationsSchema: name } }
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('The opt-in migration suite needs DATABASE_URL')
    resource = await createRequestDb(process.env.DATABASE_URL)
    peer = await createRequestDb(process.env.DATABASE_URL)
    // Establish both WS clients before launching competing transaction runners.
    await Promise.all([resource.db.execute(sql`SELECT 1`), peer.db.execute(sql`SELECT 1`)])
  }, 30_000)

  afterAll(async () => {
    try {
      if (resource)
        for (const name of fixtureSchemas) {
          // Only unique schemas created by this suite are removed.
          await resource.db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(name)} CASCADE`)
        }
    } finally {
      await Promise.all([resource?.dispose(), peer?.dispose()])
    }
  }, 30_000)

  it('pins one backend and transaction through DDL and the journal while serializing competing runners', async () => {
    const test = fixture()
    const results = await Promise.all([
      applyMigrations(resource.db, [test.first], test.options),
      applyMigrations(peer.db, [test.first], test.options),
    ])
    expect(results.map((result) => result.applied).sort()).toEqual([0, 1])
    expect(results.every((result) => result.total === 1)).toBe(true)
    const probe = await resource.db.execute<{
      backend_pid: number
      transaction_id: string
      lock_held: boolean
    }>(sql.raw(`SELECT backend_pid, transaction_id, lock_held FROM ${test.table} ORDER BY step`))
    expect(probe.rows).toHaveLength(2)
    expect(probe.rows[0]).toEqual(probe.rows[1])
    expect(probe.rows.every((row) => row.lock_held)).toBe(true)
    const transactionId = (BigInt(probe.rows[0].transaction_id) % (1n << 32n)).toString()
    const journal = await resource.db.execute<{ transaction_id: string }>(sql`
      SELECT xmin::text AS transaction_id FROM ${sql.identifier(test.name)}.migrations
    `)
    const schema = await resource.db.execute<{ transaction_id: string }>(sql`
      SELECT xmin::text AS transaction_id FROM pg_namespace WHERE nspname = ${test.name}
    `)
    const table = await resource.db.execute<{ transaction_id: string }>(sql`
      SELECT c.xmin::text AS transaction_id FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${test.name} AND c.relname = 'migrations'
    `)
    expect([
      journal.rows[0].transaction_id,
      schema.rows[0].transaction_id,
      table.rows[0].transaction_id,
    ]).toEqual([transactionId, transactionId, transactionId])
    expect(await applyMigrations(resource.db, [test.first], test.options)).toEqual({
      applied: 0,
      total: 1,
    })
  }, 30_000)

  it('rolls back pending SQL and its journal together and releases the transaction lock after failure', async () => {
    const test = fixture()
    await applyMigrations(resource.db, [test.first], test.options)
    const failed = migration(2, [test.record(3), 'SELECT 1 / 0'])
    await expect(applyMigrations(resource.db, [test.first, failed], test.options)).rejects.toThrow()
    const rows = await resource.db.execute<{ step: number }>(
      sql.raw(`SELECT step FROM ${test.table} ORDER BY step`),
    )
    expect(rows.rows.map((row) => row.step)).toEqual([1, 2])
    const journal = await resource.db.execute<{ count: number }>(sql`
      SELECT count(*)::int AS count FROM ${sql.identifier(test.name)}.migrations
    `)
    expect(journal.rows[0].count).toBe(1)
    // A different frontend client can acquire the same xact lock after rollback.
    const repaired = migration(2, [test.record(3)])
    expect(await applyMigrations(peer.db, [test.first, repaired], test.options)).toEqual({
      applied: 1,
      total: 2,
    })
    expect(await applyMigrations(resource.db, [test.first, repaired], test.options)).toEqual({
      applied: 0,
      total: 2,
    })
  }, 30_000)

  it('refuses modified or unknown applied history before adding another local migration', async () => {
    const test = fixture()
    const second = migration(2, [test.record(3)])
    await applyMigrations(resource.db, [test.first, second], test.options)
    await expect(
      applyMigrations(resource.db, [{ ...test.first, hash: '0'.repeat(64) }, second], test.options),
    ).rejects.toBeInstanceOf(MigrationHistoryError)
    await expect(applyMigrations(resource.db, [test.first], test.options)).rejects.toBeInstanceOf(
      MigrationHistoryError,
    )
    await expect(
      applyMigrations(resource.db, [test.first, migration(3, [test.record(4)])], test.options),
    ).rejects.toBeInstanceOf(MigrationHistoryError)
    expect(await applyMigrations(resource.db, [test.first, second], test.options)).toEqual({
      applied: 0,
      total: 2,
    })
    const rows = await resource.db.execute<{ step: number }>(
      sql.raw(`SELECT step FROM ${test.table} ORDER BY step`),
    )
    expect(rows.rows.map((row) => row.step)).toEqual([1, 2, 3])
  }, 30_000)
})
