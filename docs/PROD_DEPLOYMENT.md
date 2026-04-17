# Prod Deployment Checklist

Prod = `jpjvexfldouobiiczhax` (Ink Bloop, served at **inkbloop.com**). Dev = `kshwkljbhbwyqumnxuzu` (Ink Bloop Dev, served at **inkbloop-dev.vercel.app**).

The Supabase MCP is configured for **prod**. The Supabase CLI is normally linked to prod as well. For dev work, temporarily `supabase link --project-ref kshwkljbhbwyqumnxuzu`, do the work, then relink back to prod.

A merge to `main` only ships the frontend. Database schema changes, RLS policies, and edge functions each ship through their own channel and must be applied explicitly. This doc tracks what has been applied to dev but not yet to prod.

---

## Pending prod changes

_No pending changes — dev and prod are in sync as of the last sync._

When new changes are made on dev, add entries here so the next prod push knows what needs to ship (migrations, edge functions, secrets, frontend).

---

## Standard playbooks

### Apply a new migration to dev
```
npx supabase link --project-ref kshwkljbhbwyqumnxuzu
npx supabase db push --linked
npx supabase link --project-ref jpjvexfldouobiiczhax   # relink back to prod
```

### Apply a new migration to prod
Same as dev, but use prod project ref. Double-check the migration is non-breaking and has been exercised on dev first.
```
npx supabase link --project-ref jpjvexfldouobiiczhax   # already linked by default
npx supabase db push --linked
```

### Deploy an edge function
```
npx supabase functions deploy <name> --project-ref <dev_or_prod_ref> --no-verify-jwt
```
Docker is not required (CLI falls back to bundling locally).

**ALWAYS pass `--no-verify-jwt`.** The `verify_jwt` setting is reset on every deploy (it does not inherit from the prior version), defaulting to `true`. This project uses ES256-signed user tokens, which the gateway verifier cannot handle — leaving verify_jwt on causes every call to return `HTTP 401 UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM` before the function code even runs. Each function authenticates internally via `supabase.auth.getUser()`, so disabling gateway verification is safe. Same rule when deploying via the `mcp__supabase__deploy_edge_function` tool — pass `verify_jwt: false`.

### Set an edge function secret
```
npx supabase secrets set SECRET_NAME=<value> --project-ref <dev_or_prod_ref>
```
Required secrets currently in use:
- `API_KEY_SECRET` — AES-GCM key for encrypting per-user Anthropic API keys
- `GROQ_API_KEY` — shared Groq key used by `transcribe-audio` edge function

### Deploy frontend
- Dev: `npm run deploy:dev` → aliased to `inkbloop-dev.vercel.app`
- Prod: `npm run deploy:prod` → aliased to `inkbloop.com`

---

## Prod deploy order (general)

When shipping a batch of changes from dev to prod:
1. **Migrations first** — apply any pending DB migrations to prod via `supabase db push --linked`.
2. **Secrets** — set any new edge-function secrets on prod before deploying functions that depend on them.
3. **Edge functions** — deploy all functions that changed, each with `--no-verify-jwt`.
4. **Merge `dev` → `main`** — `git checkout main && git merge dev && git push origin main`.
5. **Frontend** — `npm run deploy:prod`.

The frontend is always last so users only see new UI once the backend can serve it. This avoids windows where, e.g., a new frontend emits a value that the current DB check constraint rejects.

---

## Known caveats

- **Migration history drift:** The dev project's `supabase_migrations.schema_migrations` was empty until recently. If you link a new environment and `db push` wants to re-apply old migrations, use:
  ```
  npx supabase migration repair --linked --status applied 00001 00002 ... 00012
  ```
  to mark pre-existing migrations as applied without re-running them.

- **MCP is prod-only.** Any `mcp__supabase__*` call targets prod. For dev, use the CLI.

- **Ordering:** when shipping a change that touches both DB and code (like `Cover Up`), apply the DB migration **before** the frontend deploy so users don't hit "check constraint violation" errors during the window where the frontend can emit a new value that the DB rejects.

- **iOS PWA mic permission persistence:** Voice input on `*.vercel.app` (dev) does not persistently grant mic permission across hard-close cycles on iOS — a known iOS PWA limitation for shared-host domains. On the custom prod domain (`inkbloop.com`), permission should persist normally. If prod also loses permission across hard-closes, that's a real iOS bug worth filing.
