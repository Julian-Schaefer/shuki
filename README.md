# Shuki

A self-hostable, open-source home for your research papers and the knowledge you build around them.

> **Status:** early development. The foundation (accounts, library, PDF storage, background jobs, self-hosting) is in place; paper import, search, notes and AI features are next – see the [roadmap](#roadmap).

## Features

- 📚 Personal paper library with PDF upload and storage
- 🗂️ Nested folders and tags to organize papers
- 👥 Multi-user – the first account becomes admin, sign-ups can be closed
- ⚙️ Background processing via a job queue (metadata, full text, embeddings – coming soon)
- 🐳 One `docker compose up` to self-host; any S3-compatible storage works
- 🌗 Light and dark mode

## Self-hosting

Requirements: Docker with Compose.

```sh
git clone https://github.com/Julian-Schaefer/shuki.git
cd shuki/deploy
cp .env.example .env      # set BETTER_AUTH_SECRET, POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY
docker compose up -d
```

Open <http://localhost:3000> and create your account – the first one becomes the administrator.

More in [docs/self-hosting.md](docs/self-hosting.md): reverse proxy/HTTPS, backups, updates, external S3, AI providers.

## Architecture

```
Browser ──► app (Hono :3000) ──► PostgreSQL (data + pg-boss job queue)
              │ tRPC · auth · file streaming      ▲
              └──► S3 storage                     │
                     ▲                            │
                     └────────── worker ──────────┘
```

| Part               | Tech                                                                             |
| ------------------ | -------------------------------------------------------------------------------- |
| `apps/web`         | React 19, Vite, Tailwind CSS v4, shadcn/ui, TanStack Router & Query, tRPC client |
| `apps/server`      | Hono, tRPC v11, Better Auth – serves the API and the built web app               |
| `apps/worker`      | pg-boss consumer for asynchronous work                                           |
| `packages/db`      | Drizzle ORM schema and migrations (PostgreSQL + pgvector)                        |
| `packages/jobs`    | Typed queue definitions shared by server and worker                              |
| `packages/storage` | S3 client wrapper                                                                |
| `packages/config`  | Environment validation with Zod                                                  |

The server only _enqueues_ jobs, the worker only _consumes_ them. Processing state lives on the domain tables (e.g. `paper.status`), so the UI never needs to read queue internals.

## Development

Requirements: Node.js 26 (see `.nvmrc`), pnpm 12, Docker.

```sh
pnpm install
cp .env.example .env
pnpm services:up          # PostgreSQL + S3 storage in Docker
pnpm db:migrate
pnpm dev                  # web on :5173, API on :3000, worker
```

| Command                                      |                                                            |
| -------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                   | Run web, server and worker with reload                     |
| `pnpm build`                                 | Production builds                                          |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks                                                     |
| `pnpm format`                                | Format and auto-fix with Biome                             |
| `pnpm db:generate`                           | Create a migration after changing `packages/db/src/schema` |
| `pnpm db:migrate`                            | Apply migrations                                           |
| `pnpm db:studio`                             | Browse the database with Drizzle Studio                    |

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions, e.g. how to add a new background job.

## Roadmap

1. Paper import: PDF text extraction, DOI/arXiv import, metadata enrichment (Crossref, arXiv, OpenAlex), PDF viewer
2. Full-text search across papers (PostgreSQL FTS + trigram)
3. Notes linked to papers
4. Web clipping
5. Embeddings, semantic search and summaries via any OpenAI-compatible provider (OpenAI, Ollama, …)
6. Export/import (BibTeX, Markdown), sharing between users

## License

[AGPL-3.0](LICENSE)
