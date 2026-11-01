import nextEnv from '@next/env'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { createRequestDb } from '../src/server/db'
import { applyMigrations } from '../src/server/migrations'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to apply migrations')

let connection: Awaited<ReturnType<typeof createRequestDb>> | undefined
try {
  connection = await createRequestDb(process.env.DATABASE_URL)
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' })
  const result = await applyMigrations(connection.db, migrations)
  console.log(
    `Fitt database migrations are current (${result.total} recorded; ${result.applied} applied).`,
  )
} catch (error) {
  // SQL/driver messages may include connection details; preserve a safe diagnostic code.
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  console.error(
    'Migration failed.',
    /^[A-Z0-9_]{2,40}$/.test(code) ? code : 'See migration SQL and connection configuration.',
  )
  process.exitCode = 1
} finally {
  await connection?.dispose()
}
