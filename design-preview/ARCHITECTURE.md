# Production target

This is a design-review prototype. It does not migrate the current application or connect to production services.

The approved design will be implemented on:

- Next.js 16 App Router, React 19, and Tailwind CSS v4.
- Cloudflare Workers through `@opennextjs/cloudflare`.
- Neon Postgres and Drizzle through `@turnal-io/db/serverless`, using the WebSocket driver and per-request pools. Release each pool in request cleanup with `ctx.waitUntil(pool.end())`.
- Better Auth through `@turnal-io/auth`, with magic links and Google sign-in; passwordless.
- Workspace-scoped realtime through `WorkspaceDO`, using Durable Object WebSocket Hibernation.

## Component and state boundaries

Use App Router server components for authenticated page composition and reads. Keep client boundaries around session logging, timers, exercise playback, feedback animations, and interactive settings. Keep workout/progression rules and reward calculations independent of presentation.

Translate the preview's semantic color, spacing, typography, radius, and motion tokens into Tailwind v4 theme tokens. Preserve the current F logo. Use shared components for buttons, progress meters, navigation, badges, dialogs, and workout cards rather than page-specific copies.

The preview uses in-memory sample data only. The existing local-first app remains the baseline. Production migration must preserve versioned workout history and include a deliberate account-sync strategy; changing the framework must not silently discard device history.

## Backend integration

Verify the actual Turnal package interfaces before implementation. Keep DB/auth imports server-only. Create pools per request, perform the request's Drizzle work, and schedule `pool.end()` in a `finally` cleanup through the Cloudflare execution context. Do not retain live database pools across Worker requests or hibernation.

Authorize every workout/history read and write against the authenticated actor and workspace. Compute durable XP, personal bests, and awards from validated workout events on the server, with transactional and idempotent award issuance. Replayed offline events and realtime reconnects must not grant duplicate XP. Client celebrations display the result of the event; they do not establish server authority.

Authorize WebSocket upgrades before admitting a connection to WorkspaceDO. Use hibernation-compatible APIs and serialized connection metadata, with workspace isolation, reconnect handling, and event deduplication.

## UX and validation

- Support keyboard, touch, screen readers, visible focus, sufficient contrast, and 44 px touch targets.
- Respect reduced motion. Make celebratory effects brief and user-adjustable.
- Reward achievable effort, personal progress, weekly consistency, and returning after time away. Preserve earned progress through rest days.
- Label loading, empty, offline, error, and success states clearly. Keep controls stable during updates.
- Validate responsive layouts, complete/partial sessions, duplicate event handling, offline recovery, accessibility, and authentication/workspace boundaries before release.

The design preview deliberately leaves final reward thresholds, copy, visual intensity, and navigation open for user feedback.
