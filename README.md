# Ink Bloop

Messaging + booking app for tattoo artists. Single-operator workflow: inbound Instagram/Messenger DMs → agent-assisted triage → bookings → calendar.

**Stack**: React 19 + Vite + TypeScript, Tailwind 4, Zustand, Supabase (Postgres + edge functions + Storage), framer-motion. Standalone Express + WebSocket simulator for local Meta API testing.

## Quick start

```bash
git clone git@github.com:jparro00/InkBloop.git
cd InkBloop
npm install
cp .env.example .env      # fill in Supabase dev creds
npm run dev               # frontend on :5173
npm run sim               # simulator on :3001
```

Full setup (env vars, Supabase link, evals): see [docs/setup.md](docs/setup.md).

## Where to look

- [CLAUDE.md](CLAUDE.md) — repo map, feature-doc index, key commands, critical gotchas.
- [docs/](docs/) — feature-scoped docs (messaging, bookings, clients, agents, supabase, simulator, deployment, design).
- [docs/CONVENTIONS.md](docs/CONVENTIONS.md) — how the docs system works, how to extend it.

## Deployment

- `npm run deploy:dev` → `inkbloop-dev.vercel.app`
- `npm run deploy:prod` → `inkbloop.com` (requires explicit permission)

See [docs/deployment.md](docs/deployment.md) for project refs, prod-vs-dev rules, and the deploy playbook.
