# Shuki

Self-hostable paper & notes library. pnpm + Turborepo monorepo:
`apps/web` (React, Vite, shadcn, TanStack Router/Query), `apps/server` (Hono + tRPC, Better Auth),
`apps/worker` (pg-boss jobs), `packages/*` (db/Drizzle, jobs, storage/S3, config).

## Commands

- `pnpm dev` – web, server and worker (needs `pnpm services:up` for Postgres + S3)
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`
- `pnpm db:generate --name <name>` after schema changes, then `pnpm db:migrate`

## Code style

- We move fast: keep code self-explanatory instead of commenting it.
- Comment only what the code can't say itself – a non-obvious _why_, a workaround, a security
  constraint. One short line is the norm.
- No comments that restate the code, narrate steps, or document obvious props/functions.
  No multi-paragraph JSDoc.
