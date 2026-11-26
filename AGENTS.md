# Manage Tech Service — agent instructions

Admin portal + public shop for an IT service desk. Staff work Zendesk-driven
tickets, orders, catalog, and payments; customers get their own sign-in and
portal. Zendesk is the system of record for customers, companies, tickets, and
orders; Stripe and Alternative Payments handle money. Every third-party call
lives in `src/lib/portal/**` or `src/lib/auth/**` and runs server-side — the
browser never holds a vendor secret.

## Commands

- `npm install && cp sample.env .env && npm run dev` → `0.0.0.0:8080`.
- `npm run build` → `vite build` then `npm run db:migrate` (migrations run on
  every Vercel deploy).
- `npm run typecheck` (`tsc --noEmit`), `npm run lint`, `npm run format`.
- `npm test` — `node --test` over `scripts/**/*.test.mjs`, then the listed
  `src/lib/**/*.test.ts` files via `node --experimental-strip-types --test`.
- Single test: `node --experimental-strip-types --test src/lib/portal/security.test.ts`.
- `npm run check:auth` — fails when the running dev server and the next build
  disagree about `VITE_AUTH_ENABLED`.
- `npm run preview:restart` / `npm run preview:stop` — built output on
  `127.0.0.1:8081`.

## Environment

- Copy `sample.env` → `.env`; never commit it. Real env wins over values saved
  in the admin UI.
- No `DATABASE_URL` → embedded PGLite (`@electric-sql/pglite`), same migrations
  applied at boot; set → Neon. `dbSource` in `src/lib/db.ts` reports which.
- `VITE_AUTH_ENABLED` comes from `scripts/with-app-env.mjs` reading
  `.grok/app-env.json` (real env wins). Default on; `false` is local-dev only
  (dev user) — never deploy with auth off.
- Ticket read/write need `ZENDESK_EMAIL` + `ZENDESK_API_TOKEN`. Without a real
  token the portal still signs in, but Zendesk-backed screens come back empty.
- `ZENDESK_END_USER_JWT_*` is the Auth Services signing key for messaging; blank
  means no JWT is issued (`endUserJwtConfigured()` is false).

## Architecture

- TanStack Start (SSR) + Vite + React 19 + Tailwind v4; file routes in
  `src/routes`. `src/routeTree.gen.ts` is generated — never edit it.
- Route surface:
  - `src/routes/production/signin.tsx` — the public entry; `/`, `/login`,
    `/portal/login` redirect here (`src/lib/portal/redirects.ts`).
  - `src/routes/production/user-portal/**` — customer portal.
  - `src/routes/production/admin-portal/**` — staff admin.
  - `src/routes/store/$slug/**` — public shop; once the browser has opened the
    customer portal, `__root.tsx` rewrites `/store/<slug>/<sku>` to
    `/production/user-portal/product/<sku>`.
  - `src/routes/_app/**` — legacy staff paths; the same rewrites map `/tickets`
    and friends to `/production/admin-portal/*` after the admin shell is opened.
  - `src/routes/api/**` — agent, auth, jobs, oauth, payments, zendesk.
  - `src/routes/conversations.ts` — Zendesk webhook.
- Server logic: `src/lib/portal/**`, `src/lib/auth/**`; DB in `src/lib/db.ts`
  (tagged-template `sql` or `sql.query`); SQL in `migrations/`, applied in
  filename order, one transaction each, recorded in `_migrations`.
- Auth: the first signed-in person is a customer; `BOOTSTRAP_OWNER_EMAIL`
  creates the first owner while the staff table is empty. Staff are invited by
  email.

## Gotchas

- Never invoke Vite directly (`npx vite dev`): it bypasses the env wrapper, so
  dev and build can disagree on `VITE_AUTH_ENABLED`. Use the npm scripts.
- Migrations are read non-recursively — the opt-in auth schema under
  `migrations/auth/` is deliberately not applied.
- Migrations prefer the unpooled Neon URL (`DATABASE_URL_UNPOOLED` /
  `POSTGRES_URL_NON_POOLING`); the driver strips `channel_binding`, which
  node-postgres rejects.
- Do not add `src/routes/auth/popup.tsx` — the Vite plugin already serves
  `/auth/popup` from `src/routes/auth/popup.ts`, and a React page there renders
  the app inside the popup.
- Deployed to Vercel: no runtime filesystem writes and no dev-only imports in
  server code.

## Platform invariants (Grok preview)

- Serve on `0.0.0.0:8080`; that is the only port the preview proxy finds.
- `startup.sh` is the revive contract: keep it, keep it idempotent, start the
  app with `npm run dev`.
- Never delete or rewrite `public/__grok/`, `server/`, `scripts/grok-pwa-*`, the
  PWA injector, or `<PreviewHostBridge />` in `__root.tsx`; never add `og:*` /
  `twitter:card` meta to `__root.tsx` (the injector owns them).
- Never remove or hide the "Created with Grok" pill — that is a project setting,
  not a code change.

## Execution loop (platform preview, condensed to the steps that bite)

5. Keep the preview up: `sh startup.sh` is idempotent and only starts what is
   down; the app must listen on `0.0.0.0:8080`.
6. **Brand-asset pass — a subagent, never waited for.** Custom-card apps
   dispatch the `og` skill's brand pass as a subagent and never wait for it: no
   `wait_tasks`, and never `get_task_output` on the brand task — reading a
   task's output consumes it, and a consumed task sends no completion
   notification, so the card's result, failure included, would reach nobody.
   While it runs it keeps `/workspace/.grok/og-pending` fresh (stale after 10
   minutes), so a missing-card warning mid-task is no cue to redo its work.
7. Verify the rendered app on desktop and mobile before calling it done.

## Verify before done

- `npm run typecheck` is a clean gate; `npm run build` validates the bundle.
  `db:migrate` reads exported env only (Vercel supplies it) — locally use
  `node --env-file=.env scripts/migrate.mjs` or it skips.
- `npm test` is green except for template tests this customized app has
  outgrown: share-card/OG in `grok-pwa-plugin.test.mjs`; auth-off assumptions
  in `with-app-env.test.mjs` / `check-auth-invariant.test.mjs` (`.grok/app-env.json`
  has no `VITE_AUTH_ENABLED=false`); `migration-plan.test.mjs` expects an empty
  `migrations/`. Compare against a pre-change run instead of chasing those.
- `npm run lint` reports thousands of pre-existing violations (SQL tagged
  templates trip `no-unused-expressions`); check your own diff, not the total.
- After UI changes, `node scripts/browser-smoke.mjs` against the dev server and
  read both screenshots it writes (desktop + mobile); visible content and a
  clean console are both required.
