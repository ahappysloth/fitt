# Fitt

A mobile-first, installable calisthenics app. Built with React, TypeScript, Vite, and an offline service worker, with a static-assets configuration for Cloudflare Workers.

## Develop

Use Node.js 22.12+ (validated with Node 24) and npm. No environment variables, credentials, database, or external API are needed for local development.

```sh
cd /workspace/fitt
npm ci
npm run dev
```

The development server uses port 5173. For a production build with offline caching:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

The service worker is enabled in the production build, not the Vite development server. Once the first full load completes, the app shell, fonts, exercise instructions, and original animated movement guides are cached locally. Installation requires HTTPS in production; localhost is also a secure development context. On iOS, use Safari → Share → Add to Home Screen.

## ChatGPT and standalone HTML previews

Open **`preview/fitt.html`** for a file-based preview. `npm run build` generates it alongside the production PWA; `npm run build:preview` regenerates only this HTML file. It includes the compiled application, styles, fonts, icons, and movement guides in one file, so it requires no running server or external assets.

The root `index.html` is Vite's source entry and references TypeScript. Opening it directly in an HTML viewer cannot run the app. The standalone file bundles that source into browser-ready JavaScript. Its service-worker integration is disabled because file previews have no deployment scope; the normal `dist` build retains offline installation support.

Embedded previews can block browser storage. Fitt remains usable in memory and displays an export reminder in that case. Export a backup before closing the preview if you want to keep its workouts. The app supports preview contexts where `crypto.randomUUID` is unavailable.

## Features

- Equipment-aware full-body, upper-body, lower-body, and core workouts, with 20/30/45-minute planning budgets and beginner/intermediate starting points.
- 26 exercises, each with original interactive motion illustrations, slow playback, written technique instructions, and highlighted front/back muscle diagrams.
- Editable reps, timed holds, added vest weight in kilograms, and easy/good/hard effort ratings. Unilateral reps are per side, as described in the exercise instructions.
- Immediate adjustment of unfinished sets after a hard or missed target, easier/harder exercise swaps, optional extra sets, and rest/hold timers.
- Autosaved sessions that resume after a reload; partial workouts preserve only logged performance in totals.
- A training journal, calendar-week goals, working-set charts, and exercise-specific best-set trends with added load shown separately.
- Versioned JSON export/import, validation before restore, confirmation before replacing data, and a data-reset confirmation.
- Responsive desktop navigation and mobile bottom navigation; keyboard-operable dialogs and controls; animations start only when requested.

## How progression works

The generator uses the most recent compatible variation for each movement pattern. An exercise advances after two consecutive recorded attempts in which **every set** meets its prescribed reps/time and added load with good or easy effort. It adds one rep per set, or five seconds for holds. At the upper end of a movement’s range, it selects the linked harder variation only if its equipment is available. If no harder variation is available, a weighted-capable exercise can add 2.5 kg when a vest is selected. Otherwise, the target stays at the top of its current range.

A missed target, reduced load, or hard effort reduces the next prescription, with load reduction preferred before a simpler variation. During a workout, adaptations apply only to unlogged sets; completed set values and their target snapshots are retained. A partial exercise cannot earn an increase. Previously logged work is preserved when equipment or preferences change. Changing the experience level resets the upcoming plan’s starting variation, not history.

These are transparent heuristics, not an AI model, medical assessment, or measured recovery estimate. Session times are planning estimates. Muscle maps indicate involvement, not exact activation or fatigue. No-equipment back movements provide light control work; they do not replace loaded rows or pull-ups. The drawings are schematic movement guides, not filmed demonstrations or individual form assessments.

## Validate

```sh
npm test
npm run build
npm run test:e2e
npm run check:deploy
```

Unit tests cover equipment combinations, progression/regression, unit changes, workout adaptation, backup integrity, and calendar boundaries. Playwright runs end-to-end checks in Chromium at desktop and mobile viewport sizes, including offline reload, exercise guides, weight entry, full/partial workouts, autosave/resume, and backup round trips. It starts a production preview server on port 4173. Run the build first.

The cloud environment includes `/usr/bin/chromium`. Elsewhere, install Playwright’s browser with `npx playwright install chromium`, or set `CHROMIUM_PATH` to an installed Chromium executable. The tests use that local executable automatically when available. Mobile checks emulate Chromium; native Safari installation should be checked on a real iOS device before release.

## Cloudflare Workers

`wrangler.jsonc` serves `dist` through Workers Static Assets with a single-page fallback. `public/_headers` supplies cache and security headers. No database or Worker API is needed for this version. To validate the Worker locally after building:

```sh
npm run dev:worker
```

When you choose to deploy, authenticate Wrangler with your Cloudflare account, choose your desired Worker name in `wrangler.jsonc`, and run:

```sh
npm run deploy
```

The project is prepared for deployment; setup does not publish it. `check:deploy` is a local dry run and needs no Cloudflare credentials. Account sync can be added later with a Worker API and an appropriate database/authentication layer.

## Data and backup behavior

Data is stored under `form.training.v1` in localStorage for the current browser and origin. This existing key is deliberately retained after the Fitt rename to preserve earlier workouts and backups. Nothing is sent to a server. Clearing browser storage, private browsing expiration, changing devices, or moving to another domain can make local history unavailable. Export a backup from **My setup** before changing origin or browser, then import it at the destination. Import replaces existing local data after confirmation. This first version is intended for one active browser tab at a time.

Malformed stored data is not overwritten automatically. The app pauses saving and offers export so the original data can be recovered. Storage/quota failures show a persistent message; export an in-memory backup to retain current changes.

## Project structure

- `src/lib/catalog.ts`: equipment requirements, technique cues, and progression links.
- `src/lib/workout.ts`: pure workout generation, adaptation, and summary functions.
- `src/lib/storage.ts`: versioned state parsing and persistence.
- `src/components/ExerciseGuide.tsx`: exercise poses, animated guides, and matching thumbnails.
- `src/components/ExerciseArtwork.tsx`: shared illustrated athlete, clothing, and body contours.
- `src/components/Visuals.tsx`: original brand, hero art, and muscle maps.
- `src/App.tsx`: application state and navigation.
- `src/styles.css`: responsive interface and accessible interaction states.

Use the existing checkout. Cloud tasks are isolated already; a Git worktree is unnecessary unless specifically requested. This is a local implementation. Do not commit or push changes unless explicitly requested.
