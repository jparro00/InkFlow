# Prod Deployment Checklist

Prod = `jpjvexfldouobiiczhax` (Ink Bloop). Dev = `kshwkljbhbwyqumnxuzu` (Ink Bloop Dev).

The Supabase MCP is configured for **prod**. The Supabase CLI is normally linked to prod as well. For dev work, temporarily `supabase link --project-ref kshwkljbhbwyqumnxuzu`, do the work, then relink back to prod.

A merge to `main` only ships the frontend. Database schema changes, RLS policies, and edge functions each ship through their own channel and must be applied explicitly. This doc tracks what has been applied to dev but not yet to prod.

---

## Pending prod changes

### 1. Migration `00013_agent_feedback.sql`
- **Status on dev:** applied
- **Status on prod:** **ALREADY APPLIED** (was applied via MCP earlier — do NOT re-run)
- Creates `agent_feedback` table + RLS policies. Non-breaking.

### 2. Migration `00014_add_cover_up_booking_type.sql`
- **Status on dev:** applied
- **Status on prod:** **ALREADY APPLIED** (was applied via MCP earlier — do NOT re-run)
- Broadens `bookings_type_check` to allow `'Cover Up'`. Non-breaking (existing rows are unaffected; rejects nothing that was previously accepted).

### 3. Edge function `agent-parse`
- **Status on dev:** deployed (knows about Cover Up)
- **Status on prod:** **ALREADY DEPLOYED** with Cover Up support via MCP earlier
- Safe to leave — prod frontend can't produce `type: "Cover Up"` yet, and the function tolerates older inputs.

### 4. Edge function `parse-booking`
- **Status on dev:** deployed (knows about Cover Up)
- **Status on prod:** NOT YET DEPLOYED — still only knows the original 4 types
- **Action when ready for prod:**
  ```
  npx supabase functions deploy parse-booking --project-ref jpjvexfldouobiiczhax
  ```

### 5. Frontend (Cover Up type + "Inklet - AI Assistant" rename + agent feedback UI)
- **Status on dev:** deployed to `inkbloop-dev.vercel.app`
- **Status on prod:** NOT YET DEPLOYED
- **Action when ready for prod:** merge `dev` → `main`, then `npm run deploy:prod` (or push to main if auto-deploy is wired).

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
npx supabase functions deploy <name> --project-ref <dev_or_prod_ref>
```
Docker is not required (CLI falls back to bundling locally).

### Deploy frontend
- Dev: `npm run deploy:dev` → aliased to `inkbloop-dev.vercel.app`
- Prod: `npm run deploy:prod`

---

## Known caveats

- **Migration history drift:** The dev project's `supabase_migrations.schema_migrations` was empty until recently. If you link a new environment and `db push` wants to re-apply old migrations, use:
  ```
  npx supabase migration repair --linked --status applied 00001 00002 ... 00012
  ```
  to mark pre-existing migrations as applied without re-running them.

- **MCP is prod-only.** Any `mcp__supabase__*` call targets prod. For dev, use the CLI.

- **Ordering:** when shipping a change that touches both DB and code (like `Cover Up`), apply the DB migration **before** the frontend deploy so users don't hit "check constraint violation" errors during the window where the frontend can emit a new value that the DB rejects.
