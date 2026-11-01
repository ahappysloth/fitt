import { defineConfig } from 'drizzle-kit'

// Generation is offline. Applying a migration is a separate, explicit command.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  strict: true,
})
