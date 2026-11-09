# Fitt

A responsive, installable calisthenics app built with **vinext, React 19, and Tailwind CSS v4**, using App Router conventions and the **Cloudflare Vite plugin** to run on Workers. Train on your device without an account, or sign in to sync completed workouts, routines, and preferences through Neon. Device history is imported only when you explicitly choose to add it to an account.

## Develop

Use Node.js 22.12+ and npm (validated with Node 24). Installing the private `@turnal-io/*` packages requires `GITHUB_PACKAGES_TOKEN` with package read access; `.npmrc` contains only a variable reference. In the managed environment, use the configured registry HTTP-secret binding. Do not put its value in source files.

```sh
npm ci
npm run dev
```

Development runs on port **5173**. To test the production app, including offline support:

```sh
npm run build
npm run preview
```

The built Worker runs locally through Wrangler on **http://127.0.0.1:4173**. This exercises the same Worker routing, bindings, and static assets as a deployment. A service worker caches the app, local fonts, exercise instructions, and existing animated guides after a successful initial load. Installation requires HTTPS in production; localhost also supports development testing. On iOS, use Safari → Share → Add to Home Screen.

## Features

- **Today:** an equipment-aware plan, weekly calendar, momentum, muscle focus, saved routines, and a five-minute option for low-energy days.
- **Workout:** editable reps, timed holds, added vest weight in kilograms, effort ratings, rest/hold timers, exercise swaps, and autosave/resume. Hard or missed sets adjust upcoming targets.
- **Routine builder:** choose and reorder movements, set targets, save reusable workouts, and edit or delete them. Leaving unsaved changes requires confirmation.
- **Journey:** workout history, weekly activity, comparable personal bests, XP, levels, and milestone awards derived from real saved sessions.
- **Library:** 26 exercises with equipment and muscle filters, written technique instructions, front/back muscle diagrams, and the existing offline animated guides.
- **Settings:** name, beginner/intermediate level, equipment, focus, session length, weekly goal, playful/calm celebrations, install guidance, and validated backup/restore.
- **Optional accounts:** Google or magic-link sign-in, explicit device-history import, account-scoped offline changes, conflict resolution, and cross-device sync. Active workouts remain on the device where they started.
- **Accessible interaction:** responsive desktop/mobile navigation, keyboard-operated dialogs, visible focus states, reduced-motion support, and a calm celebration option.

The interface preserves the F logo and approved charcoal/electric-lime design. Knee Push-up now has an interactive 3D form-guide prototype; the remaining exercise illustrations are reused pending review. Run `npm run build:form-preview` to create `preview/fitt-form-studio.html`. See the [form-guide foundation](docs/form-guides.md) and [asset provenance](assets/form-guide/README.md).

## Training and rewards

The adaptive plan uses the latest compatible movement variation. Each new session preserves its starting prescription and planned set count separately from adjusted suggestions and recorded results. Two complete, comparable exposures at the same starting targets, added load, and set count can earn a small increase when each set has explicit Easy or Just right feedback. Increases are one rep per set or five seconds for holds. At the movement's upper range, the planner can choose an available harder variation or add 2.5 kg for an eligible weighted movement.

Effort ratings are optional and start unselected. Complete demonstrated work can recalibrate an underestimated starting target without earning an additional progression. Partial work, deleted sets, defaults, and mixed loads cannot manufacture two comparable successes. Higher weight with fewer reps is evaluated in its own load context. Later untouched sets adapt immediately; intentional entries stay locked until **Reset to target** is chosen. Original prescription snapshots and completed results are retained through corrections, backups, and account sync. Legacy history remains readable without inventing missing evidence. Saved custom routines keep their chosen starting targets. See [training engine policy](docs/training-engine.md) for the exact scope and remaining limits.

Rewards are calculated from saved history: **5 XP per logged set, 35 XP per saved session, 15 XP for a comparable personal best, and 25 XP for meeting the weekly goal**. Personal-best and weekly bonuses are awarded at most once per session/week respectively. A level is 250 XP. The first workout of a week fixes that week's goal so later preference changes do not rewrite earned progress. Rest days never subtract XP. First exposure to a movement is a baseline; personal bests compare the same exercise, unit, and added load.

Session durations are planning estimates. Muscle diagrams show involvement, not measured activation or fatigue. The exercise drawings are schematic guides. No-equipment back movements provide light control work; they do not replace loaded rows or pull-ups.

## Data and backup behavior

Guest training is stored under **`form.training.v1`** in localStorage for the current browser and origin. The original key and version remain compatible with existing workouts and backups. Legacy records receive the new optional preferences/reward metadata without losing exercise data. Signed-in accounts use separate local caches and queues keyed by account ID; signing in never automatically uploads guest data.

Export from **Settings** to keep an independent backup, especially before clearing browser storage or moving unsynced progress to another browser/domain. Import validates the complete backup and asks before replacing data. Reset also requires confirmation. For signed-in accounts, replacement/deletion syncs to the account and its other devices; the dialogs make that scope explicit. Clearing browser storage removes pending changes that have not reached the server.

Malformed original data is preserved and automatic writes pause. The recovery banner can download the original data separately from current in-memory progress. If storage fills up or is blocked, the app remains usable in memory and offers export. A successful later write clears a transient storage error. If another tab changes training data, the current tab pauses writes to prevent overwriting that tab's work; reload to use the latest saved state.

## ChatGPT and standalone previews

```sh
npm run build:preview
```

Open **`preview/fitt.html`** for the complete app in a single HTML file. It bundles JavaScript, styles, fonts, icons, and guides and needs no running server or external assets. This is also the file to open in ChatGPT's web preview. The root `index.html` is an exporter source entry and cannot run directly in a file viewer.

The standalone artifact disables service-worker registration and account requests because it has no server or deployment scope. Embedded previews may block browser storage; in that case, export a backup before closing to preserve progress. Its separate Vite exporter does not include the server runtime or private account configuration.

The approved component study remains in `design-preview/` for reference. It is separate from the working application.

## Validate

```sh
npm run typecheck
npm run typecheck:worker
npm test
npm run test:realtime
npm run test:email-worker
npm run test:worker-context
npm run format:check
npm run check:compatibility
npm run check:deploy
npm run test:worker-account
npm run build:preview
npm run build:form-preview
npm run test:e2e
```

Unit tests cover progression/regression, equipment combinations, reward/calendar rules, backup integrity, service-worker caching, account isolation, offline queues, merge conflicts, request validation, and realtime authentication. Playwright covers desktop and mobile workflows, including offline reload, saved routines, full/partial workouts, resume, backups, legacy migration, quota failures, real cross-tab conflicts, and an opaque embedded preview. Build the Worker and both standalone previews before running it. The suite starts or reuses the built Worker on port 4173. Current migration results and outstanding hosted checks are recorded in [vinext migration validation](docs/vinext-migration.md).

With the Fitt development database migrated, `npm run test:db` runs actual transaction/auth tests and `npm run test:account` exercises two browser devices, explicit import, offline replay, and account isolation. These opt-in tests create uniquely named fixture users and delete only those fixtures afterward. They never send email to a real recipient. See [account setup and validation](docs/accounts.md). The separate [realtime runtime test](docs/realtime-testing.md) exercises the Durable Object in local workerd without external services. `test:email-worker` verifies the actual Worker mail module and rendering with a stubbed delivery transport; real SMTP delivery still needs a hosted check.

The cloud environment provides `/usr/bin/chromium`. Elsewhere, use `npx playwright install chromium` or set `CHROMIUM_PATH`. Mobile tests emulate Chromium; Safari installation still needs a real iOS device check before release.

## Cloudflare and account services

The configured deployment target is `https://fitt.turnal.workers.dev`. See [deployment setup](docs/deployment.md) for Worker secrets, Google callbacks, first deployment, and the GitHub Actions workflow.

```sh
npm run build:worker
npm run dev:worker
```

Vite produces the Worker module graph in `dist/server/`, static assets in `dist/client/`, and the deployment configuration at `dist/server/wrangler.json`. The source `worker.ts` handles authenticated realtime upgrades, gates Admin documents, delegates app requests to `vinext/server/app-router-entry`, and exports `WorkspaceDO`. Native `cloudflare:workers` bindings supply the request environment and background-work lifetime. `npm run check:deploy` validates this output with a Wrangler dry run and **does not publish**. Afterward, `npm run test:worker-account` checks account metadata, origin rejection, private Admin boundaries, realtime routing, and assets in local workerd using synthetic bindings. `npm run test:worker-context` separately verifies request cleanup with native Worker bindings.

The migration deploys to the existing `fitt` Worker and production URL after local validation. The existing Google callback and hostname remain valid. Keep `backup/nextjs-before-vinext` pointing to release `dd1f1b2` and record the active Cloudflare version before merging the migration into `main`. The main workflow deploys the checked commit; `npm run deploy` is the equivalent authorized manual build and deployment command.

Accounts use Neon/Drizzle through `@turnal-io/db/serverless`, passwordless Better Auth through `@turnal-io/auth`, and `WorkspaceDO` with WebSocket Hibernation. Copy the names in `.env.example` into your development environment; use `.dev.vars.example` for optional ignored Worker-local configuration and provision deployed Worker secrets separately. Apply the versioned schema explicitly with `npm run db:migrate`; neither app startup nor builds apply migrations. SMTP uses TLS on port 465. The managed cloud environment's HTTP proxy cannot enable public SMTP, so hosted delivery still needs validation on an appropriate runtime. See [account setup](docs/accounts.md) and [platform details](docs/platform.md). Next remains a development dependency for the Turnal auth package's peer/type requirements; it does not serve the deployed app.

## Project structure

Public pages are `/`, `/workout`, `/journey`, `/library`, `/settings`, and `/builder`. A shared `(training)` layout keeps the training store mounted while navigating. Explicit route files support direct links and refresh; native History API transitions keep client views usable offline and protect unsaved edits during Back/Forward. The service worker precaches each public route's anonymous HTML with the matching build's assets. Unknown routes, Admin documents, API requests, and RSC responses are never given an offline shell. The verified administrator's native studios are `/admin` and `/admin/components`; see [Admin studio](docs/admin-studio.md).

- `src/app/`: App Router shell, route handlers, metadata, loading/error boundaries, and Tailwind tokens.
- `src/App.tsx`: app navigation, local state coordination, and session lifecycle.
- `src/components/`: Today, Workout, Journey, Library, Settings, builder, shared UI, and existing guides.
- `src/lib/catalog.ts`, `workout.ts`, `rewards.ts`: exercise catalog and pure training/reward rules.
- `src/lib/storage.ts`, `useTrainingStore.ts`: backup validation, migration, persistence, and recovery.
- `src/lib/cloud/`: account caches, offline queue, merge rules, session transitions, and sync controls.
- `src/server/`, `src/db/`, `drizzle/`: request-scoped services, validated training API, schema, and versioned SQL migrations.
- `worker.ts`, `src/server/realtime/`: authenticated revision notifications and hibernating Durable Objects.
- `src/lib/usePwa.ts`, `scripts/`: offline installation, version updates, and preview generation.
- `tests/`: desktop/mobile end-to-end workflows.

Use the existing checkout. Cloud tasks are already isolated; a worktree is unnecessary unless requested. Commit, push, and deploy only within the user's current authorization.
