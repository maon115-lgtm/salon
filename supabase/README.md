# Supabase database

Status: project `salon` (`xbwfaczirkzgnxpqtcwb`) was created in Mumbai and the SQL migration was applied through the SQL Editor on 2026-10-20. Server credentials are configured in ignored local `.dev.vars`. Live application verification passed on 2026-11-09 after resuming the paused project and fixing Workers redirect handling. Temporary test records were removed. See `docs/PROJECT_STATUS.md` for current verification and outstanding deployment work. A GitHub push does not apply SQL or configure runtime secrets.

## Structure

- PostgreSQL tables `salon_workspaces` and `salon_branches`.
- Each workspace stores its existing application state as JSONB and a revision number. This preserves the current data model; customers, services and bookings are not yet separate relational tables.
- `salon_store` is a bounded RPC used only by the application server. It accepts named operations, never arbitrary SQL.
- RLS is enabled; `anon` and `authenticated` have no table or RPC permissions. Only the server's `service_role` can access the store. Existing ChatGPT sign-in and API permission checks remain authoritative. This migration does not implement Supabase Auth.
- Branch creation is transactional. Booking writes and visibility changes lock the same workspace row and check its revision, preventing lost updates and booking after a committed hide operation.

## Configuration reference (existing project already provisioned)

1. Select or create a dedicated project. Confirm organization, region and plan before provisioning anything billable.
2. Apply `migrations/202610200001_salon_storage.sql` once using Supabase migrations or SQL Editor. Do not run this against unrelated tables or reapply an already applied migration.
3. Configure server runtime variables `DB_PROVIDER=supabase`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Use a secret key (`sb_secret_...`), not the browser's publishable key. Keep it in the hosting secret store, never GitHub, chat, client code or `NEXT_PUBLIC_*`.
4. For local Wrangler development, copy `.dev.vars.example` to ignored `.dev.vars`, fill the values, then restart the server. Wrangler reads this from the project root. For hosted deployments, set the same variables in the host's runtime settings; `.dev.vars` is not deployed.
5. Validate reading, creating a test branch, persisting a booking after reload, stale revision conflicts, and isolation from another account against the actual cloud project. Remove only test fixtures created for that verification.

Current D1 bindings/migrations remain intact as a local fallback selected explicitly; the configured preview uses Supabase. Explicit `DB_PROVIDER=d1` selects D1; otherwise any Supabase setting selects Supabase and incomplete settings fail closed. There is no automatic fallback or double-write.

## Existing data

Local SQLite data is preserved and is not automatically uploaded. Decide whether to migrate it or start with a clean cloud database. A migration needs an export and backup, validation, and a deliberate mapping of local mock identities to real owner identities. Do not copy `local_seedy` or other test account ownership into production. Never replace existing cloud records with a development snapshot.

## Validation

After configuring server secrets, run `npm run db:check:supabase`. This makes a read-only authenticated RPC request against the configured project and reports success only after the actual response. It prints no keys or customer records. It does not prove write access, concurrent booking behavior or deployment.

`node --test tests/supabase.test.mjs` runs the actual SQL migration and adapter against PGlite (PostgreSQL in memory), checks grants/RLS, transaction rollback, stale revisions, branch filters and unavailable bookings. PGlite uses one connection: these tests do not establish multi-connection race behavior or verify a live Supabase connection.

`node --test tests/domain.test.mjs tests/access.test.mjs tests/categories.test.mjs` covers application rules and authorization. Existing API integration tests target the local D1 preview and must not be run against a live Supabase project.

Official references:
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Live application verification

`SUPABASE_TEST_WRITES=1 node --env-file=.dev.vars scripts/verify-supabase-live.mjs` runs against the local app and its configured cloud project. It creates a temporary test branch, checks persistence and concurrent booking, then deletes only that generated branch and workspace. Never run the old D1 API fixture tests against this cloud-configured preview.

Cloudflare Workers supports `redirect: manual`, not `redirect: error`. The adapter uses manual redirects and rejects non-success responses, so it never forwards the secret key to a redirect destination.
