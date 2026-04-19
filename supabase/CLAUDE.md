# Working in `supabase/`

Scoped rules when editing migrations, edge functions, or policies. For the full backend map see [../docs/supabase.md](../docs/supabase.md); for deploy commands see [../docs/deployment.md](../docs/deployment.md).

## Hard rules

- **Migrations are append-only.** Never edit or delete `migrations/<n>_*.sql` after it's committed. Create a new migration instead.
- **Every edge-function deploy needs `--no-verify-jwt`.** The setting resets on every deploy. ES256 user tokens break the gateway verifier; each function authenticates internally via `supabase.auth.getUser()`.
- **Use the CLI, not the MCP, for dev.** `mcp__supabase__*` calls target **prod**. For dev: `npx supabase link --project-ref <dev-ref>` then CLI commands.
- **Don't add RLS to `sim_*` tables.** They're dev-only; access is gated at the `sim-api` / `graph-api` edge-function layer via service role.

## Migration etiquette

- File naming: `00016_<snake_case_description>.sql`, next number after the latest in `migrations/`.
- Every new user-owned table gets RLS enabled + per-user `CREATE POLICY` using `(SELECT auth.uid()) = user_id`. Wrap `auth.uid()` in `SELECT` so it caches per query (see migration 00011).
- Adding a Realtime-subscribed table? Enable publication AND `ALTER TABLE ... REPLICA IDENTITY FULL;` (needed for row-filter subscriptions).
- Storage buckets: prefer private + per-user `{user_id}/...` path scoping over public buckets. `avatars` is the exception (private + authenticated read) because paths aren't user-scoped.
- Idempotent where possible: `on conflict ... do nothing`, `create ... if not exists`. Makes it safe to paste directly into prod SQL Editor if `db push` can't run (see deployment.md drift note).

## Edge function etiquette

- Functions that touch `sim_*` tables use `SUPABASE_SERVICE_ROLE_KEY` (no user context). Today that's `webhook`, `sim-api`, `graph-api`.
- All others validate the user via `supabase.auth.getUser(bearer)` and fail fast on missing session.
- Secrets live in Supabase Secrets (`supabase secrets set ...`), never hardcoded. Current in use: `API_KEY_SECRET` (AES-GCM for per-user Anthropic keys), `GROQ_API_KEY`, `APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, `OWNER_USER_ID`, `RESEND_API_KEY`.
- `webhook` verifies `X-Hub-Signature-256` on every POST — no bypass, even in dev. Simulator signs with the same `APP_SECRET`.
- Prefer upserts over select-then-insert for idempotency: `messages` by `mid`, `participant_profiles` by `(user_id, psid)`.

## Deploy commands (summary)

```bash
# Dev
npx supabase link --project-ref kshwkljbhbwyqumnxuzu
npx supabase db push --linked
npx supabase functions deploy <name> --project-ref kshwkljbhbwyqumnxuzu --no-verify-jwt
npx supabase link --project-ref jpjvexfldouobiiczhax   # relink to prod

# Prod
npx supabase link --project-ref jpjvexfldouobiiczhax
npx supabase db push --linked
npx supabase functions deploy <name> --project-ref jpjvexfldouobiiczhax --no-verify-jwt
```

Full prod deploy order (migrations → secrets → edge fns → frontend) and pending prod changes live in [../docs/deployment.md](../docs/deployment.md).
