import { sql } from 'drizzle-orm'
import type { MigrationMeta } from 'drizzle-orm/migrator'
import type { ServerDb } from './db'

const MIGRATION_LOCK = 1742871917

export class MigrationHistoryError extends Error {
  readonly code = 'MIGRATION_HISTORY_MISMATCH'
  constructor() {
    super('Migration history does not match the local immutable migration files.')
    this.name = 'MigrationHistoryError'
  }
}

/**
 * Consume Drizzle's public readMigrationFiles output while keeping the lock,
 * journal discovery, schema changes, and journal writes in one transaction.
 *
 * Do not call Drizzle's migrate() inside this callback: its dialect migrator
 * uses session.transaction(), which can issue a new BEGIN/COMMIT rather than
 * a savepoint. That would end the transaction holding our advisory lock.
 */
export async function applyMigrations(
  db: ServerDb,
  migrations: MigrationMeta[],
  options: { migrationsSchema?: string; migrationsTable?: string } = {},
): Promise<{ applied: number; total: number }> {
  const local = new Map<number, MigrationMeta>()
  let previousTimestamp = -1
  for (const migration of migrations) {
    if (
      !Number.isSafeInteger(migration.folderMillis) ||
      migration.folderMillis <= previousTimestamp
    ) {
      throw new MigrationHistoryError()
    }
    local.set(migration.folderMillis, migration)
    previousTimestamp = migration.folderMillis
  }
  const migrationSchema = sql.identifier(options.migrationsSchema ?? 'fitt_meta')
  const migrationTable = sql.identifier(options.migrationsTable ?? 'migrations')
  return db.transaction(
    async (tx) => {
      // PgBouncer transaction pooling pins the backend from BEGIN through COMMIT.
      // An xact lock is also released on rollback/disconnect, unlike a session lock.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK}::bigint)`)
      await tx.execute(sql`CREATE SCHEMA IF NOT EXISTS ${migrationSchema}`)
      // Preserve Drizzle's existing journal table and row format exactly.
      await tx.execute(sql`
      CREATE TABLE IF NOT EXISTS ${migrationSchema}.${migrationTable} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `)
      const journal = await tx.execute<{ hash: string; created_at: string | number | null }>(sql`
      SELECT hash, created_at FROM ${migrationSchema}.${migrationTable} ORDER BY created_at
    `)
      const recorded = new Map<number, string>()
      let latest = -1
      for (const row of journal.rows) {
        const timestamp = Number(row.created_at)
        if (
          row.created_at === null ||
          !Number.isSafeInteger(timestamp) ||
          timestamp < 0 ||
          recorded.has(timestamp)
        ) {
          throw new MigrationHistoryError()
        }
        // Do not migrate an old/diverged checkout over unknown database history.
        if (local.get(timestamp)?.hash !== row.hash) throw new MigrationHistoryError()
        recorded.set(timestamp, row.hash)
        latest = Math.max(latest, timestamp)
      }

      let applied = 0
      for (const migration of migrations) {
        const existing = recorded.get(migration.folderMillis)
        if (existing !== undefined) {
          if (existing !== migration.hash) throw new MigrationHistoryError()
          continue
        }
        if (migration.folderMillis <= latest) throw new MigrationHistoryError()
        // Statements come only from reviewed local migration files, never a request.
        // Keep migration SQL transaction-safe: no transaction control or concurrent DDL.
        for (const statement of migration.sql) {
          if (statement.trim()) await tx.execute(sql.raw(statement))
        }
        await tx.execute(sql`
        INSERT INTO ${migrationSchema}.${migrationTable} (hash, created_at)
        VALUES (${migration.hash}, ${migration.folderMillis})
      `)
        recorded.set(migration.folderMillis, migration.hash)
        latest = migration.folderMillis
        applied += 1
      }
      return { applied, total: recorded.size }
      // A waiter must re-read the journal after the preceding runner commits.
      // READ COMMITTED gives each statement a fresh snapshot after the lock wait.
    },
    { isolationLevel: 'read committed' },
  )
}
