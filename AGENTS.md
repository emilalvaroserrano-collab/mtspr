# Manage Tech Service

Admin portal + public online shop for an IT service desk. React 19, TanStack Start/Router/Query, Tailwind v4, Better Auth, Kysely. Postgres via Neon or embedded PGLite; Zendesk (Support + Conversations), Stripe, Alternative Payments. Agent tools (Sarah) live in `src/lib/portal/sarah*`.

## Commands

- `npm run dev` — Vite dev server via `scripts/with-app-env.mjs`, host `0.0.0.0`, port `8080` (strict). Do **not** run `vite` / `npx vite` directly.
- `npm run build` — `vite build` + `npm run db:migrate`.
- `npm run db:migrate` — `node scripts/migrate.mjs` (applies `migrations/` in filename order).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint .`.
- `npm run format` — `prettier --write .`.
- `npm test` — `node --test 'scripts/**/*.test.mjs' && node --experimental-strip-types --test <src test files>`. Node test runner, not vitest/jest.
- `npm run check:auth` — `node scripts/check-auth-invariant.mjs` (dev-only).
- `npm run preview` / `preview:restart` / `preview:stop`.

## Environment

- Copy `sample.env` → `.env` for local values; never commit real secrets. Env vars override admin-saved values.
- `DATABASE_URL` optional locally (embedded PGLite); on Vercel use Neon (`DATABASE_URL`, pooler `DATABASE_URL_UNPOOLED`).
- `VITE_AUTH_ENABLED=false` only for local dev without auth; do not deploy with auth disabled.
- Integrations: `ZENDESK_*`, `STRIPE_*`, `ALTERNATIVE_*`, `RESEND_*`, `UPS_*`, `CRON_SECRET`.

## Brand-asset pass

- While the pass runs it owns `/workspace/.grok/og-pending`; the check goes stale after 10 minutes, and a stale marker means the warning is real again.

## Hard rules for the app shell (verified here — don't break)

- Never put `og:*` / `twitter:card` in `src/routes/__root.tsx`; the PWA injector overwrites head tags on every response.
- Keep the branding injector (`grokPwaPlugin()` + `server/middleware/grok-pwa.ts`); never strip it, hide the pill, add the script yourself, or add a CSP blocking `https://grok.com`.
- Keep `<PreviewHostBridge />` mounted near the top of `<body>`; never delete or strip it.
- Never create `src/routes/auth/popup.tsx` — the Vite plugin already serves `/auth/popup`; never render "Sign in / Re-auth" buttons outside the app-data login error state.

## Architecture notes an agent gets wrong

- Staff admin: `src/routes/_app/` + `src/routes/production/admin-portal.tsx`. Customer portal: `src/routes/portal/` + `src/routes/production/user-portal.tsx`. Public shop: `src/routes/store/`. API/auth: `src/routes/api`, `src/routes/auth`.
- Catch-all `src/routes/$.tsx` → `/portal`; entry gate in `src/routes/__root.tsx` reads sessionStorage flags `mts-production-admin` / `mts-production-portal`.
- Path rewrites: `src/lib/portal/paths.ts` (`rewriteAdminPath`, `rewriteProductionPath`, `catalogHref`, `checkoutHref`) and `src/lib/portal/redirects.ts` (`publicRedirect`). `/store/<slug>/...` clicked from the portal context rewrites into `/production/user-portal/...`.
- Server functions in `src/lib/portal/` (incl. large `api.ts`, agent tools `sarah*`) write the DB; the browser never calls Zendesk/Stripe/Alt Payments directly.
- Migrations: filename-ordered SQL in `migrations/`; applied by `npm run db:migrate` (also during build).
- Shop cart: localStorage key `mts-store-cart` (`src/lib/portal/store-cart.ts`). Shared `Checkout` component in `src/routes/store/$slug/checkout.tsx` serves both store and portal checkout; portal reads `?sku=` / `?pay=1`.

## Execution loop

1. Read the task and repo instruction files.
2. Explore, then plan.
3. Implement in small reversible steps.
4. Verify with typecheck, lint, tests, and build.
5. Review against the task.
6. **Brand-asset pass**: dispatch as a task subagent; never wait for it. No wait_tasks, and never get_task_output on the brand task: a consumed task sends no completion notification, so the card's result would reach nobody. Keep building; the pass wakes you later.
7. Ship, report, and stop.

## Verification before finishing

- `npm run typecheck`, `npm run lint`, and `npm test` must pass; run `npm run build` before finishing.
- Browser render check: `node scripts/browser-smoke.mjs` (desktop + mobile); interactive QA via the `agent-browser` CLI.

## Deeper docs

- `README.md` (run steps, env table, data flow, shop flow), `knowledge.md` (Sarah agent knowledge), `.grok/references/*.md` (scaffold, deploy-target, browser-qa, etc.).
