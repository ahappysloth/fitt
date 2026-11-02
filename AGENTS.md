Fitt runs on vinext with the Cloudflare Vite plugin. `npm run dev` starts Vite;
`npm run build` creates `dist/server` and `dist/client`; `npm run preview` runs
the built Worker in workerd. Next is retained only for the auth package's peer
dependency and compatible API types. Do not restore the Next CLI or OpenNext.
Check vinext's installed documentation/source for runtime behavior; the Next
documentation below remains useful for the compatible App Router API surface.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
