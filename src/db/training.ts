import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import type { Profile, Session, UserPreferences, Workout } from '../lib/types'
import { user } from './auth'

export const trainingProfiles = pgTable(
  'fitt_training_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull().default(0),
    profile: jsonb('profile').$type<Profile>().notNull(),
    preferences: jsonb('preferences').$type<UserPreferences>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('fitt_training_revision_valid', sql`${table.revision} >= 0`)],
)

/** Canonical completed-session documents, with columns for common history queries. */
export const trainingWorkouts = pgTable(
  'fitt_training_workouts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => trainingProfiles.userId, { onDelete: 'cascade' }),
    id: varchar('id', { length: 128 }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
    duration: doublePrecision('duration').notNull(),
    data: jsonb('data').$type<Session>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index('fitt_training_workouts_completed_idx').on(table.userId, table.completedAt),
    check('fitt_training_workout_duration_valid', sql`${table.duration} between 1 and 180`),
  ],
)

/** Queryable set facts are updated atomically with their canonical workout document. */
export const trainingWorkoutSets = pgTable(
  'fitt_training_workout_sets',
  {
    userId: text('user_id').notNull(),
    workoutId: varchar('workout_id', { length: 128 }).notNull(),
    id: varchar('id', { length: 128 }).notNull(),
    exerciseId: varchar('exercise_id', { length: 128 }).notNull(),
    exerciseIndex: integer('exercise_index').notNull(),
    setIndex: integer('set_index').notNull(),
    target: doublePrecision('target').notNull(),
    reps: doublePrecision('reps').notNull(),
    load: doublePrecision('load').notNull(),
    targetLoad: doublePrecision('target_load').notNull(),
    effort: varchar('effort', { length: 8 }).notNull(),
    done: boolean('done').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.workoutId, table.id] }),
    foreignKey({
      columns: [table.userId, table.workoutId],
      foreignColumns: [trainingWorkouts.userId, trainingWorkouts.id],
      name: 'fitt_training_workout_sets_workout_fk',
    }).onDelete('cascade'),
    uniqueIndex('fitt_training_workout_sets_position_idx').on(
      table.userId,
      table.workoutId,
      table.exerciseIndex,
      table.setIndex,
    ),
    index('fitt_training_workout_sets_exercise_idx').on(table.userId, table.exerciseId),
    check(
      'fitt_training_set_position_valid',
      sql`${table.exerciseIndex} between 0 and 29 and ${table.setIndex} between 0 and 9`,
    ),
    check(
      'fitt_training_set_reps_valid',
      sql`${table.reps} between 0 and 600 and ${table.target} between 1 and 600`,
    ),
    check(
      'fitt_training_set_load_valid',
      sql`${table.load} between 0 and 300 and ${table.targetLoad} between 0 and 300`,
    ),
    check('fitt_training_set_effort_valid', sql`${table.effort} in ('easy', 'good', 'hard')`),
  ],
)

export const trainingRoutines = pgTable(
  'fitt_training_routines',
  {
    userId: text('user_id')
      .notNull()
      .references(() => trainingProfiles.userId, { onDelete: 'cascade' }),
    id: varchar('id', { length: 128 }).notNull(),
    position: integer('position').notNull(),
    data: jsonb('data').$type<Workout>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    check('fitt_training_routine_position_valid', sql`${table.position} between 0 and 99`),
  ],
)

/** Bounded per-account idempotency receipts; expired receipts are still protected by CAS. */
export const trainingMutations = pgTable(
  'fitt_training_mutations',
  {
    userId: text('user_id')
      .notNull()
      .references(() => trainingProfiles.userId, { onDelete: 'cascade' }),
    mutationId: varchar('mutation_id', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    revision: integer('revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mutationId] }),
    index('fitt_training_mutations_recent_idx').on(table.userId, table.createdAt),
    check('fitt_training_mutation_revision_valid', sql`${table.revision} >= 0`),
  ],
)
