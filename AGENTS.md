Fitt runs on vinext with the Cloudflare Vite plugin. `npm run dev` starts Vite;
`npm run build` creates `dist/server` and `dist/client`; `npm run preview` runs
the built Worker in workerd. The `next` package is not installed: vinext
implements the supported `next/*` imports, and its fallback declarations
(`vinext/types` in `tsconfig.json`) type them. Do not restore the Next CLI,
the `next` package, or OpenNext.

Check vinext's installed documentation and source (`node_modules/vinext/`,
`node_modules/@vinext/types/`) for runtime behavior and the supported App
Router API surface; it may differ from the Next.js you know. Auth is built with
the framework-free root entry of `@turnal-io/auth` (see `docs/platform.md`).
