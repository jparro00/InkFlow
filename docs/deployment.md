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
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — used by `r2-upload-url`, `consent-upload-url`, `consent-reject`, `consent-analyze-id`. See [r2-migration-plan.md](./r2-migration-plan.md).
- `AWS_TEXTRACT_REGION`, `AWS_TEXTRACT_ACCESS_KEY_ID`, `AWS_TEXTRACT_SECRET_ACCESS_KEY` — used by `consent-analyze-id` to call AWS Textract `AnalyzeID`. The IAM user only needs `textract:AnalyzeID` permission. Region defaults to `us-east-1` if unset.
- `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — used by `consent-submit` to send Web Push notifications via the `web-push` library. Public key half lives in the frontend env as `VITE_VAPID_PUBLIC_KEY` and is the same in dev + prod (the keypair authenticates our server to push providers; it's not origin-bound). `VAPID_SUBJECT` is `mailto:<contact-email>`. Generated via `npx web-push generate-vapid-keys --json` — never regenerate without re-issuing all device subscriptions.

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

_None — consent forms feature shipped to prod on 2026-04-27 (migrations 00023–00028, AWS Textract secrets, 5 consent edge functions, workers/images redeploy, frontend)._

## Known caveats

- **Migration history naming.** The CLI keys versions on the leading numeric prefix only (e.g. `00007`), not the full filename (`00007_simulator_tables`). If a new entry lands under the full filename — or worse, under a CLI-generated timestamp — `db push` will refuse with "Remote migration versions not found in local migrations directory". Both prod and dev `supabase_migrations.schema_migrations` were repaired on 2026-04-25 to use the bare-prefix form. Future entries should follow the same pattern.

- **MCP is prod-only.** Any `mcp__supabase__*` call targets prod. For dev, use the CLI.

- **DB-before-frontend ordering** matters for any change that touches both. Apply the DB migration **before** the frontend deploy so users don't hit "check constraint violation" during the rollout window.

- **iOS PWA storage / permissions across hard close.** Once the app is installed via Add to Home Screen, iOS treats it as its own first-party app. WebKit's [Tracking Prevention Policy](https://webkit.org/tracking-prevention/) explicitly exempts installed PWAs from ITP's 7-day script-writeable-storage cap, so notification permission, mic permission, IndexedDB, and `PushSubscription` all persist across hard close, reboot, and long idle. The 7-day rule applies only to in-Safari browsing — it does **not** apply to installed PWAs, and there is no documented penalty for shared subdomains like `*.vercel.app` once installed. Both `inkbloop-dev.vercel.app` and `inkbloop.com` behave the same way; they are simply independent origins, so the artist must install + grant permission on each one separately.

## Related docs

- [setup.md](./setup.md) — first-time local setup
- [supabase.md](./supabase.md) — schema/migrations/edge functions reference
- [`supabase/CLAUDE.md`](../supabase/CLAUDE.md) — scoped rules when editing the `supabase/` tree
