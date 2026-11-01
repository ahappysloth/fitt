# Fitt — Momentum design study

An isolated, interactive design preview for review before changing the production app.

Run `node design-preview/build.mjs` from the repository root, then open `preview/fitt-redesign.html`. The output is a self-contained HTML file, including fonts and exercise illustrations, with no server or network requests required.

Run `npx tsc --project design-preview/tsconfig.json` to type-check the prototype. Shared visual primitives live in `components.tsx`, original artwork in `Artwork.tsx`, and sample data in `demo-data.ts`.

All workout history, XP, awards, and personal bests in this prototype are sample data. Interactions stay in memory. The preview never reads or writes the app's localStorage and never registers a service worker. “Reset demo” restores the starting state.

Review the Today, Workout, and Journey screens; try logging sets, the five-minute quick start, the completion celebration, and the component lab. The review toolbar also offers mobile framing, two accent options, and calm/playful celebration styles.

The existing F logo and production application remain unchanged. New reward rules are proposals for discussion, not changes to the production progression engine.

Review direction: keep electric lime (`#C7FA53`) against neutral charcoal. Card surfaces (`#151515`) sit close to the canvas (`#101010`), with subtle borders and restrained accent lighting for separation. The type scale separates compact chips (10 px equivalents), metadata (11 px), section labels and secondary card copy (12 px), and body text/main actions (14 px). The sidebar description and quick-win link use 12 px. Chip padding stays compact, while interactive controls retain their touch targets. Typography tokens use rem units so browser font preferences remain effective.
