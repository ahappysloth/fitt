# Fitt

A responsive, installable calisthenics app built with **Next.js 16 App Router, React 19, and Tailwind CSS v4**, ready for Cloudflare Workers through **OpenNext**. This version saves training on the device. It needs no account, credentials, database, or external API.

## Develop

Use Node.js 22.12+ and npm (validated with Node 24).

```sh
npm ci
npm run dev
```

Development runs on port **5173**. To test the production app, including offline support:

```sh
npm run build
npm run preview
```

The production server runs on port **4173**. A service worker caches the app, local fonts, exercise instructions, and existing animated guides after a successful initial load. Installation requires HTTPS in production; localhost also supports development testing. On iOS, use Safari → Share → Add to Home Screen.

## Features

- **Today:** an equipment-aware plan, weekly calendar, momentum, muscle focus, saved routines, and a five-minute option for low-energy days.
- **Workout:** editable reps, timed holds, added vest weight in kilograms, effort ratings, rest/hold timers, exercise swaps, and autosave/resume. Hard or missed sets adjust upcoming targets.
- **Routine builder:** choose and reorder movements, set targets, save reusable workouts, and edit or delete them. Leaving unsaved changes requires confirmation.
- **Journey:** workout history, weekly activity, comparable personal bests, XP, levels, and milestone awards derived from real saved sessions.
- **Library:** 26 exercises with equipment and muscle filters, written technique instructions, front/back muscle diagrams, and the existing offline animated guides.
- **Settings:** name, beginner/intermediate level, equipment, focus, session length, weekly goal, playful/calm celebrations, install guidance, and validated backup/restore.
- **Accessible interaction:** responsive desktop/mobile navigation, keyboard-operated dialogs, visible focus states, reduced-motion support, and a calm celebration option.

The interface preserves the F logo and approved charcoal/electric-lime design. Knee Push-up now has an interactive 3D form-guide prototype; the remaining exercise illustrations are reused pending review. Run `npm run build:form-preview` to create `preview/fitt-form-studio.html`. See the [form-guide foundation](docs/form-guides.md) and [asset provenance](assets/form-guide/README.md).

## Training and rewards

The adaptive plan uses the latest compatible movement variation. It increases targets after two consecutive recorded attempts where **every set** meets its prescribed reps/time and added load with good or easy effort. Increases are one rep per set or five seconds for holds. At the movement's upper range, the planner chooses an available harder variation; eligible exercises can instead add 2.5 kg when a weighted vest is selected.

A missed target, reduced load, or challenging effort reduces the next prescription. During a workout, only unlogged sets change; recorded values and target snapshots stay intact. A partial exercise cannot earn an increase. Saved custom routines keep their chosen targets until edited, while the generated plan adapts to history. Removing equipment preserves history and prevents starting routines that still require it. Added-load prescriptions and backups share a 300 kg validation ceiling.

Rewards are calculated from saved history: **5 XP per logged set, 35 XP per saved session, 15 XP for a comparable personal best, and 25 XP for meeting the weekly goal**. Personal-best and weekly bonuses are awarded at most once per session/week respectively. A level is 250 XP. The first workout of a week fixes that week's goal so later preference changes do not rewrite earned progress. Rest days never subtract XP. First exposure to a movement is a baseline; personal bests compare the same exercise, unit, and added load.

Session durations are planning estimates. Muscle diagrams show involvement, not measured activation or fatigue. The exercise drawings are schematic guides. No-equipment back movements provide light control work; they do not replace loaded rows or pull-ups.

## Data and backup behavior

Training is stored under **`form.training.v1`** in localStorage for the current browser and origin. The original key and version remain compatible with existing workouts and backups. Legacy records receive the new optional preferences/reward metadata without losing exercise data.

Export from **Settings** before moving to another browser or domain. Import validates the complete backup and asks before replacing local data. Reset also requires confirmation. Clearing browser storage removes the local copy; there is no account sync in this version.

Malformed original data is preserved and automatic writes pause. The recovery banner can download the original data separately from current in-memory progress. If storage fills up or is blocked, the app remains usable in memory and offers export. A successful later write clears a transient storage error. If another tab changes training data, the current tab pauses writes to prevent overwriting that tab's work; reload to use the latest saved state.

## ChatGPT and standalone previews

```sh
npm run build:preview
```

Open **`preview/fitt.html`** for the complete app in a single HTML file. It bundles JavaScript, styles, fonts, icons, and guides and needs no running server or external assets. This is also the file to open in ChatGPT's web preview. The root `index.html` is an exporter source entry and cannot run directly in a file viewer.

The standalone artifact disables service-worker registration because it has no deployment scope. Embedded previews may block browser storage; in that case, export a backup before closing to preserve progress. Vite remains only for this exporter and unit tests; the deployed app runs on Next.

The approved component study remains in `design-preview/` for reference. It is separate from the working application.

## Validate

```sh
npm run typecheck
npm test
npm run format:check
npm run build
npm run build:preview
npm run test:e2e
npm run check:deploy
```

Unit tests cover progression/regression, equipment combinations, reward/calendar rules, backup integrity, and service-worker caching. Playwright covers desktop and mobile workflows, including offline reload, saved routines, full/partial workouts, resume, backups, legacy migration, quota failures, real cross-tab conflicts, and an opaque embedded preview. Build both the production app and standalone preview before running it. The suite starts or reuses port 4173.

The cloud environment provides `/usr/bin/chromium`. Elsewhere, use `npx playwright install chromium` or set `CHROMIUM_PATH`. Mobile tests emulate Chromium; Safari installation still needs a real iOS device check before release.

## Cloudflare and future services

```sh
npm run build:worker
npm run dev:worker
```

OpenNext produces `.open-next/worker.js` and its assets. `npm run check:deploy` validates this bundle with a Wrangler dry run and **does not publish**. When deployment is authorized, authenticate Wrangler, choose the Worker name in `wrangler.jsonc`, and run `npm run deploy`.

Database, authentication, account synchronization, and realtime are deferred. The planned stack remains Neon/Drizzle through `@turnal-io/db/serverless` (WebSocket driver with per-request pools released through `ctx.waitUntil(pool.end())`), passwordless Better Auth through `@turnal-io/auth` (magic link + Google), and `WorkspaceDO` with WebSocket Hibernation. These integrations will need their real package interfaces and a migration/sync design that preserves device history. See [platform details](docs/platform.md).

## Project structure

- `src/app/`: Next App Router shell, metadata, loading/error boundaries, and Tailwind tokens.
- `src/App.tsx`: app navigation, local state coordination, and session lifecycle.
- `src/components/`: Today, Workout, Journey, Library, Settings, builder, shared UI, and existing guides.
- `src/lib/catalog.ts`, `workout.ts`, `rewards.ts`: exercise catalog and pure training/reward rules.
- `src/lib/storage.ts`, `useTrainingStore.ts`: backup validation, migration, persistence, and recovery.
- `src/lib/usePwa.ts`, `scripts/`: offline installation, version updates, and preview generation.
- `tests/`: desktop/mobile end-to-end workflows.

Use the existing checkout. Cloud tasks are already isolated; a worktree is unnecessary unless requested. Commit, push, and deploy only within the user's current authorization.
