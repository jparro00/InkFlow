# Ink Bloop

Messaging + booking app for tattoo artists. Single-operator workflow: inbound Instagram/Messenger DMs → agent-assisted triage → bookings → calendar. React + Vite frontend, Supabase backend, standalone simulator for local Meta API testing.

Note: the local directory is still named `InkFlow` for legacy reasons; the product name and GitHub repo are `InkBloop`.

## Stack

React 19, TypeScript 5.9, Vite 8, Tailwind 4, Zustand 5, framer-motion 12, date-fns 4, React Router 7. Supabase (Postgres + edge functions on Deno + Storage + Auth). Simulator is Express + WebSocket (Node).

## Repo map

```
src/            frontend app (~15k LoC)
  agents/       multi-intent agent orchestration — see docs/agents.md
  components/   React components grouped by feature
  pages/        route-level pages (HashRouter)
  stores/       Zustand stores (one per feature, persist middleware)
  services/     Supabase/API client wrappers
  contexts/     AuthContext (Supabase auth + MFA)
  hooks/        custom hooks (voice recorder, booking images)
  lib/          supabase client, IndexedDB image cache, sync
  utils/        date math, image processing, booking parsers
  data/         mockData for dev
  types/        DB types

supabase/       backend — see docs/supabase.md + supabase/CLAUDE.md
  migrations/   15 SQL migrations
  functions/    10 Deno edge functions

simulator/      local Meta API stand-in — see docs/simulator.md
scripts/        deploy-dev, run-evals
evals/          agent eval suite + result JSONs
docs/           feature docs (see table below)
test/           test harness plan
public/         static assets (logo, favicon, manifest, icons)
```

## Feature docs

These are NOT auto-loaded. Read the relevant file when working in that area.

| Working on | Read |
|-----------|------|
| Messaging, DMs, webhooks, graph-api | [messaging.md](docs/messaging.md) |
| Bookings, calendar, booking images | [bookings.md](docs/bookings.md) |
| Client CRUD, avatars, documents | [clients.md](docs/clients.md) |
| Consent forms (QR client flow, Textract OCR, artist review) | [forms.md](docs/forms.md) |
| Agent system (orchestrator, intents, resolvers) | [agents.md](docs/agents.md) |
| Supabase schema, migrations, edge fns, RLS | [supabase.md](docs/supabase.md) |
| Simulator (local Meta API stand-in) | [simulator.md](docs/simulator.md) |
| Deploying anything | [deployment.md](docs/deployment.md) |
| Colors, themes, design tokens | [design.md](docs/design.md) |
| First-time setup, env vars, dev loop | [setup.md](docs/setup.md) |
| Extending this docs system | [CONVENTIONS.md](docs/CONVENTIONS.md) |

## Key commands

```
npm run dev           vite frontend on :5173
npm run sim           simulator (Express + WS on :3001)
npm run deploy:dev    frontend → inkbloop-dev.vercel.app
npm run deploy:prod   frontend → prod (REQUIRES explicit user permission)
npm run eval          run all agent evals
npm run lint          eslint
npm run build         tsc -b && vite build
```

## Gotchas that bite

- **Prod vs dev Supabase**: the Supabase MCP is pinned to prod. For dev, use the Supabase CLI with `--project-ref <dev-ref>`. See [deployment.md](docs/deployment.md).
- **Edge function deploys need `--no-verify-jwt`** — the app uses ES256 tokens which break the gateway's default verification; this flag resets on every deploy.
- **Meta API rate limit is 200/hr per page** — only call graph-api for sending DMs or fetching older history. Page loads must never trigger Meta calls.
- **Page loads must read from DB only** — all feature pages render from Supabase, no external API calls during initial render.
- **Never deploy to prod without explicit user permission.** Dev is the default target for every deploy command.

## Adding a new feature area

1. Create `docs/<feature>.md` following the template in [CONVENTIONS.md](docs/CONVENTIONS.md).
2. Add a row to the "Feature docs" table above.
3. If the feature has scoped rules (e.g. special deploy steps, file-layout conventions), add a `CLAUDE.md` next to the code (see Tier 3 in CONVENTIONS).
4. Cross-link from related feature docs.
5. Commit with `docs: add <feature> docs`.

When in doubt, read [CONVENTIONS.md](docs/CONVENTIONS.md) before writing.
