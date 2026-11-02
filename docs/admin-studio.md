# Private admin studio

The Admin navigation item appears only after the server confirms that the signed-in account has a verified email listed in `FITT_ADMIN_EMAILS`. Store that comma-separated list as an encrypted Worker secret. For local development, put the same setting in the ignored `.env.local`; local Worker preview uses `.dev.vars`. An absent or blank list grants nobody access. Email values are not committed, exposed in public environment variables, or returned by the access endpoint.

`/api/admin/access` is UI discovery. `/api/admin/previews/form` and `/api/admin/previews/components` each repeat the server authorization check against a live Better Auth session with cookie caching disabled. They reject a mismatched `X-Fitt-Account` and never cache responses. Knowing a preview URL does not grant access.

The form studio comes from `src/form-preview/main.tsx`; the component study comes from `design-preview/main.tsx`. `npm run dev` and `npm run build` generate `.generated/admin-previews.json` from these sources before starting Next. The generated bundle is server-only and ignored by Git. It is not copied into public assets. `npm run build:admin-previews` rebuilds it independently, and `npm run build:design-preview` regenerates the original shareable local HTML artifact.

Admin fetches the protected HTML and places it in an iframe with `sandbox="allow-scripts"`, without same-origin permission. Each preview has its own styles and in-memory sample state, cannot read app cookies/local storage, and has a restrictive Content Security Policy that blocks network connections. The component celebration button uses a bounded parent-to-frame message that never changes saved workouts or earned XP. Mobile preview changes the iframe's viewport; the form studio's existing controls remain intact.

Private previews are online tools. The app's service worker does not cache `/api/` responses. Switching accounts or signing out removes access and the mounted preview; server access is checked again when opening another studio.
