# Deployment

Prod vs dev, how to ship each layer, and what's pending.

## Project refs

| Env  | Supabase ref            | Frontend URL                 |
|------|-------------------------|------------------------------|
| Prod | `jpjvexfldouobiiczhax`  | `inkbloop.com`               |
| Dev  | `kshwkljbhbwyqumnxuzu`  | `inkbloop-dev.vercel.app`    |

The Supabase **MCP is configured for prod**. The Supabase **CLI is linked to prod** by default. For dev work, temporarily `supabase link --project-ref <dev-ref>`, do the work, then relink back to prod.

**A merge to `main` only ships the frontend.** DB schema changes, RLS policies, and edge functions each ship through their own channel and must be applied explicitly.

## Deploy order (shipping a batch from dev → prod)

1. **Migrations first** — `supabase db push --linked` against prod.
2. **Secrets** — set any new edge-function secrets on prod before deploying functions that depend on them.
3. **Edge functions** — deploy each changed function with `--no-verify-jwt`.
4. **Merge** `dev` → `main`, push.
5. **Frontend** — `npm run deploy:prod`.

Frontend is always last so users only see new UI once the backend can serve it. Avoids windows where a new frontend emits a value the current DB check constraint rejects.

## Standard playbooks

### Apply a migration to dev

```bash
npx supabase link --project-ref kshwkljbhbwyqumnxuzu
npx supabase db push --linked
npx supabase link --project-ref jpjvexfldouobiiczhax   # relink to prod
```

### Apply a migration to prod

Same as dev but with prod ref. Double-check the migration is non-breaking and has been exercised on dev first.

```bash
npx supabase link --project-ref jpjvexfldouobiiczhax
npx supabase db push --linked
```

### Deploy an edge function

```bash
npx supabase functions deploy <name> --project-ref <ref> --no-verify-jwt
```

**Always pass `--no-verify-jwt`.** `verify_jwt` resets to `true` on every deploy and does not inherit from the prior version. This project uses ES256-signed user tokens which the gateway verifier cannot handle — leaving `verify_jwt` on causes `HTTP 401 UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM` before the function code runs. Each function authenticates internally via `supabase.auth.getUser()`, so disabling gateway verification is safe.

Same rule when deploying via `mcp__supabase__deploy_edge_function` — pass `verify_jwt: false`.

Docker is not required — CLI falls back to bundling locally.

### Set an edge function secret

```bash
npx supabase secrets set SECRET_NAME=<value> --project-ref <ref>
```

Current secrets in use:
- `API_KEY_SECRET` — AES-GCM key for encrypting per-user Anthropic API keys
- `GROQ_API_KEY` — shared Groq key used by `transcribe-audio` edge function
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — used by `r2-upload-url` to mint presigned R2 PUT URLs. See [r2-migration-plan.md](./r2-migration-plan.md).

### Deploy the CF images Worker

Worker lives in [`workers/images/`](../workers/images) and serves private image reads from R2 at `images-dev.inkbloop.com` (dev) and `images.inkbloop.com` (prod). Deployed via wrangler:

```bash
cd workers/images
npx wrangler deploy --env dev    # → images-dev.inkbloop.com
npx wrangler deploy --env prod   # → images.inkbloop.com (REQUIRES explicit user permission)
```

The Worker uses `custom_domain = true` in `wrangler.toml`, so DNS records are managed automatically. See [r2-migration-plan.md](./r2-migration-plan.md) for architecture.

### Deploy the frontend

```bash
npm run deploy:dev     # → inkbloop-dev.vercel.app
npm run deploy:prod    # → inkbloop.com  (REQUIRES explicit user permission)
```

Dev is the default target. Never deploy to prod without explicit user permission.

## Pending prod changes

Keep this section updated as changes land on dev but haven't shipped to prod.

_No pending changes — dev is in sync with prod as of 2026-04-23 (migration 00020 + avatars/themes/store-caching batch)._

## Known caveats

- **Migration history drift.** The dev project's `supabase_migrations.schema_migrations` was empty until recently. If a new environment's `db push` wants to re-apply old migrations, use:
  ```bash
  npx supabase migration repair --linked --status applied 00001 00002 ... 00012
  ```
  to mark pre-existing migrations as applied without re-running them.

- **MCP is prod-only.** Any `mcp__supabase__*` call targets prod. For dev, use the CLI.

- **DB-before-frontend ordering** matters for any change that touches both. Apply the DB migration **before** the frontend deploy so users don't hit "check constraint violation" during the rollout window.

- **iOS PWA mic permission persistence** — voice input on `*.vercel.app` (dev) doesn't persistently grant mic permission across hard-close cycles on iOS (shared-host domain limitation). On the custom prod domain (`inkbloop.com`), it should persist. If prod also loses it across hard-closes, that's a real iOS bug worth filing.

## Related docs

- [setup.md](./setup.md) — first-time local setup
- [supabase.md](./supabase.md) — schema/migrations/edge functions reference
- [`supabase/CLAUDE.md`](../supabase/CLAUDE.md) — scoped rules when editing the `supabase/` tree
