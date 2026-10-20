# Supabase database

Status: implementation and migration prepared. No hosted project has been linked or provisioned by these files. A GitHub push does not apply SQL or configure runtime secrets.

## Structure

- PostgreSQL tables `salon_workspaces` and `salon_branches`.
- Each workspace stores its existing application state as JSONB and a revision number. This preserves the current data model; customers, services and bookings are not yet separate relational tables.
- `salon_store` is a bounded RPC used only by the application server. It accepts named operations, never arbitrary SQL.
- RLS is enabled; `anon` and `authenticated` have no table or RPC permissions. Only the server's `service_role` can access the store. Existing ChatGPT sign-in and API permission checks remain authoritative. This migration does not implement Supabase Auth.
- Branch creation is transactional. Booking writes and visibility changes lock the same workspace row and check its revision, preventing lost updates and booking after a committed hide operation.

## Activate after connecting the intended Supabase account

1. Select or create a dedicated project. Confirm organization, region and plan before provisioning anything billable.
2. Apply `migrations/202610200001_salon_storage.sql` once using Supabase migrations or SQL Editor. Do not run this against unrelated tables or reapply an already applied migration.
3. Configure server runtime variables `DB_PROVIDER=supabase`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Use a secret key (`sb_secret_...`), not the browser's publishable key. Keep it in the hosting secret store, never GitHub, chat, client code or `NEXT_PUBLIC_*`.
4. For local Wrangler development, copy `.dev.vars.example` to ignored `.dev.vars`, fill the values, then restart the server. Wrangler reads this from the project root. For hosted deployments, set the same variables in the host's runtime settings; `.dev.vars` is not deployed.
5. Validate reading, creating a test branch, persisting a booking after reload, stale revision conflicts, and isolation from another account against the actual cloud project. Remove only test fixtures created for that verification.

Current D1 bindings/migrations remain intact for the existing local preview until the Supabase connection is supplied. Explicit `DB_PROVIDER=d1` selects D1; otherwise any Supabase setting selects Supabase and incomplete settings fail closed. There is no automatic fallback or double-write.

## Existing data

Local SQLite data is preserved and is not automatically uploaded. Decide whether to migrate it or start with a clean cloud database. A migration needs an export and backup, validation, and a deliberate mapping of local mock identities to real owner identities. Do not copy `local_seedy` or other test account ownership into production. Never replace existing cloud records with a development snapshot.

## Validation

`node --test tests/supabase.test.mjs` runs the actual SQL migration and adapter against PGlite (PostgreSQL in memory), checks grants/RLS, transaction rollback, stale revisions, branch filters and unavailable bookings. PGlite uses one connection: these tests do not establish multi-connection race behavior or verify a live Supabase connection.

`node --test tests/domain.test.mjs tests/access.test.mjs tests/categories.test.mjs` covers application rules and authorization. Existing API integration tests target the local D1 preview and must not be run against a live Supabase project.

Official references:
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/postgres/row-level-security
