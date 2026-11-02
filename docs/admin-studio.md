# Native admin studio

The Admin navigation item appears only after the server confirms that the signed-in account has a verified email listed in `FITT_ADMIN_EMAILS`. Store that comma-separated list as an encrypted Worker secret. For local development, use the ignored `.env.local`; local Worker preview uses `.dev.vars`. An absent or blank list grants nobody access. Email values are not committed, exposed in public environment variables, or returned by the access endpoint.

The Form Studio lives at `/admin`, and Components at `/admin/components`. The Worker gates both HTML and RSC requests with a live Better Auth session, with cookie caching disabled. Denied requests redirect to Settings; authorized responses are private and never cached. In-app navigation refreshes `/api/admin/access` before mounting the studio. That endpoint also rejects a mismatched `X-Fitt-Account`. Switching accounts, signing out, or losing eligibility removes the mounted studio.

Admin renders native React components in the app's normal document flow. `FormStudioContent` shares the actual form content with `src/form-preview/main.tsx`. `ComponentShowcase` and `CelebrationPreview` share demo components with `design-preview/main.tsx`. There is no iframe or nested fixed-height scrolling area. Mobile preview constrains the content width while retaining the normal page scroll. Form Studio's model controls remain unchanged.

The demo uses local component state and scoped styles: sample workouts, XP, celebrations, accent, motion, and model selections never write to the training store, browser storage, or account services. Client component source is public JavaScript, so it must contain no privileged data or secrets. All future privileged operations must enforce server authorization independently of UI visibility.

Admin is an online tool. The service worker excludes Admin documents, API responses, and RSC requests. The shareable local HTML exports remain available through `npm run build:form-preview` and `npm run build:design-preview`; their generated files are never deployed as public routes.
