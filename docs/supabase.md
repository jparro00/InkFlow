# Supabase layer

Schema, migrations, edge functions, RLS, and Storage buckets. Use this doc to navigate the backend — "which function handles X", "what columns does Y have", "which bucket does Z write to".

See also [`supabase/CLAUDE.md`](../supabase/CLAUDE.md) for scoped rules when editing files in the `supabase/` tree (migration etiquette, `--no-verify-jwt`, etc.).

## Migrations

Numbered and append-only. Never edit or delete a migration once committed — create a new one.

| # | Name | What it does |
|---|------|--------------|
| 00001 | `initial_schema` | `clients`, `bookings`, `booking_images`, `documents`, `age_verification_logs` + per-user RLS; `booking-images` and `documents` Storage buckets. |
| 00002 | `user_settings` | Encrypted `anthropic_key` column + RLS. |
| 00003 | `conversation_reads` | `(user_id, conversation_id) → last_read_mid`. |
| 00004 | `messages` | Incoming webhook messages, 20-per-conversation cap. |
| 00005 | `conversation_map` | Internal ↔ Graph conversation id cache (lazy-populated). |
| 00006 | `participant_profiles` | `(user_id, psid)` with name + pic; Realtime enabled. |
| 00007 | `simulator_tables` | `sim_profiles`, `sim_conversations`, `sim_messages`, `sim_config`; Realtime enabled; no RLS. |
| 00008 | `replica_identity_full` | `REPLICA IDENTITY FULL` on `messages` + `participant_profiles` for Realtime filters. |
| 00009 | `client_psid` | Adds `psid` column to `clients`. |
| 00010 | `device_trust` | `device_trusts` + `verification_codes` tables (feature removed 2026-04-23; tables kept, zero rows). |
| 00011 | `rls_perf_and_indexes` | Wraps `auth.uid()` in `select` (caches per query); adds FK indexes on `verification_codes`, `documents.booking_id`. |
| 00012 | `client_profile_pic` | Adds `profile_pic` column to `clients`. |
| 00013 | `agent_feedback` | Thumbs-up/down + full trace JSONB. |
| 00014 | `add_cover_up_booking_type` | Adds "Cover Up" to booking type constraint. |
| 00015 | `avatars_bucket` | Private `avatars` bucket (256 KB cap, jpeg/png/webp). Authenticated read; service-role write. |

## Tables by feature

### Messaging ([messaging.md](./messaging.md))

- `messages` — `mid`, `conversation_id`, `sender_id`, `sender_name`, `recipient_id`, `platform`, `text`, `attachments` (jsonb), `created_at`, `is_echo`, `user_id`. Pruned to last 20 per conversation.
- `conversation_reads` — `user_id`, `conversation_id` (pk), `last_read_mid`.
- `conversation_map` — `conversation_id`, `graph_conversation_id`, `user_id`.
- `participant_profiles` — `(user_id, psid)` pk, `name`, `profile_pic` (path or legacy data URL), `platform`, `updated_at`.
- `sim_profiles`, `sim_conversations`, `sim_messages`, `sim_config` — simulator-only; no RLS; see [simulator.md](./simulator.md).

### Bookings ([bookings.md](./bookings.md))

- `bookings` — `id`, `user_id`, `client_id` (nullable fk), `date` (timestamptz, no Z), `duration` (float hours), `type` (enum), `estimate` (int), `status` (enum), `rescheduled` (bool), `notes`, `quick_booking_raw`.
- `booking_images` — `id`, `user_id`, `booking_id` (cascade), `filename`, `mime_type`, `size_bytes`, `width`, `height`, `sync_status`, `remote_path`.

### Clients ([clients.md](./clients.md))

- `clients` — `id`, `user_id`, `name`, `display_name`, `phone`, `email`, `dob`, `channel` ('Facebook'|'Instagram'|'Phone'), `instagram` (psid), `facebook` (psid), `psid`, `tags` (text[]), `notes` (jsonb), `profile_pic`.
- `documents` — `id`, `user_id`, `client_id`, `booking_id` (optional), `type`, `label`, `storage_path`, `is_sensitive`, `mime_type`, `size_bytes`, `notes`.
- `age_verification_logs` — `id`, `user_id`, `client_id`, `verified_at`, `verified_by`, `document_deleted`, `notes`.

### Agent ([agents.md](./agents.md))

- `agent_feedback` — `id`, `user_id`, `rating`, `trace` (jsonb), `created_at`.

### Auth / settings

- `user_settings` — `user_id`, `anthropic_key` (AES-GCM ciphertext), `has_api_key`, `created_at`, `updated_at`.
- `device_trusts`, `verification_codes` — legacy risk-based-MFA tables. Feature ripped out 2026-04-23 (edge functions deleted); tables left in place with zero rows.

## RLS patterns

- **Standard**: `(SELECT auth.uid()) = user_id` on every CRUD policy. Wrapping in `SELECT` (migration 00011) caches per-query instead of per-row.
- **No RLS**: all `sim_*` tables — access gate is the `sim-api` / `graph-api` edge function using service role.
- **Storage `avatars`**: authenticated users can `SELECT` any path (PSIDs are random + per-user-isolated via `participant_profiles` RLS). Writes are service-role-only.
- **Storage `booking-images`, `documents`**: users `SELECT/INSERT/DELETE` within their own `{user_id}/...` folder only.
- **Service-role carveouts**: `webhook`, `sim-api`, `graph-api` use the service key. None of them trust client-side input — they validate via HMAC (webhook) or `sim_config.access_token` (graph-api).

## Edge functions (9 total)

| Name | Purpose | Auth | Key env vars |
|------|---------|------|--------------|
| `agent-parse` | Classify natural-language intent (Claude Haiku). | Bearer | `API_KEY_SECRET` |
| `agent-resolve-edit` | Resolve "change last name to have two t's" into a field diff. | Bearer | `API_KEY_SECRET` |
| `graph-api` | Dev Meta Graph API mock; prod passthrough. Reads/writes `sim_*`. | Access token | `SUPABASE_SERVICE_ROLE_KEY` |
| `parse-booking` | Quick-booking text → structured booking fields (Claude Haiku). | Bearer | `API_KEY_SECRET` |
| `r2-upload-url` | Mint presigned PUT URLs for R2 image uploads. | Bearer | `R2_*` |
| `save-api-key` | AES-GCM encrypt user's Anthropic key → `user_settings`. | Bearer | `API_KEY_SECRET` |
| `sim-api` | Simulator backend: conversations, profiles, config, send, contacts, avatar upload. | None (dev tool) | `SUPABASE_SERVICE_ROLE_KEY` |
| `transcribe-audio` | Audio blob → Groq Whisper → text. | Bearer | `GROQ_API_KEY` |
| `webhook` | Meta webhook handler. Upserts `messages` + `participant_profiles`. | HMAC-SHA256 | `APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, `OWNER_USER_ID`, `SUPABASE_SERVICE_ROLE_KEY` |

**All edge functions deploy with `--no-verify-jwt`.** See [deployment.md](./deployment.md#deploy-an-edge-function) for the reason.

## Storage buckets

| Bucket | Privacy | Path pattern | Notes |
|--------|---------|--------------|-------|
| `booking-images` | Private | `{user_id}/{booking_id}/{imageId}.{ext}` | RLS: user owns folder. No cascade on booking delete. |
| `documents` | Private | `{user_id}/{client_id}/{doc_id}.{ext}` | RLS: user owns folder. |
| `avatars` | Private (256 KB cap, jpeg/png/webp) | `{slug}.{ext}` | Authenticated read; service-role write. |

## Client initialization (`src/lib/supabase.ts`)

- `persistSession: true` — token cached in localStorage.
- `autoRefreshToken: true` — JWT refreshes before expiry.
- `storageKey: 'inkbloop-auth'` — localStorage key.
- No custom fetch, no custom realtime config — defaults are fine.

## Realtime

Enabled on: `messages`, `participant_profiles`, `sim_messages`, `sim_conversations`, `sim_profiles`.

`REPLICA IDENTITY FULL` required for row-filter subscriptions — see migration 00008. Other tables fire no Realtime events.

Client subscription pattern: `supabase.channel('user-{user_id}').on('broadcast', ...)` for message/read/profile updates. Broadcasts are best-effort; DB is source of truth.

## Gotchas

1. **Migration history drift** (dev). If `supabase_migrations.schema_migrations` is empty but migrations already exist in the DB, `db push` tries to re-run them. Repair with `supabase migration repair --linked --status applied 00001 ...`. See [deployment.md](./deployment.md#known-caveats).
2. **`--no-verify-jwt` resets on every deploy** — the CLI flag must be passed each time. Dashboard toggle doesn't persist either.
3. **HMAC verification on webhook** is mandatory in every environment. Simulator signs outgoing webhooks with the same `APP_SECRET`; mismatch returns 401 silently. Debug by comparing raw body bytes + secret.
4. **Idempotency**: `messages` upsert by `mid`; `participant_profiles` upsert by `(user_id, psid)`. Safe to retry.
5. **MCP is prod-only**. Every `mcp__supabase__*` tool call hits prod. For dev, use the CLI with `--project-ref <dev-ref>`.
6. **Avatar paths vs legacy base64**. Post-migration 00015, new rows store short paths; pre-migration rows still contain `data:` URLs. The app resolver handles both (passes `data:` through unchanged). Until a one-off cleanup runs, expect mixed content in `participant_profiles.profile_pic` / `sim_profiles.profile_pic`.
7. **Message pruning in webhook** means older messages must be fetched on demand from Meta via `graph-api` (using `conversation_map`). Plan UI flows around "last 20 available instantly; older paginated".
8. **Simulator has zero user isolation** — all `sim_*` data is shared across the dev environment. `webhook` associates incoming sim messages to `OWNER_USER_ID` from env.

## Related docs

- [deployment.md](./deployment.md) — project refs, deploy commands, secrets, prod-vs-dev.
- [`../supabase/CLAUDE.md`](../supabase/CLAUDE.md) — scoped rules for editing migrations / edge functions.
- Feature-specific schema details: [messaging.md](./messaging.md), [bookings.md](./bookings.md), [clients.md](./clients.md), [agents.md](./agents.md), [simulator.md](./simulator.md).
