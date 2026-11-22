# Contributing to Shuki

Thanks for your interest! Issues and pull requests are welcome.

## Setup

See [Development](README.md#development) in the README. Before opening a pull request run:

```sh
pnpm lint && pnpm typecheck && pnpm test
```

`pnpm format` fixes formatting and most lint issues automatically.

## Project conventions

- **Workspace packages** (`packages/*`) export TypeScript source directly. Server and worker are bundled with tsdown for production, the web app with Vite.
- **Database changes:** edit `packages/db/src/schema`, then run `pnpm db:generate --name <change>` and commit the generated SQL in `packages/db/drizzle`. Never edit migrations that were already released.
- **Multi-tenancy:** every domain table has a `user_id`. Every query in a tRPC procedure or route must filter by `ctx.user.id`.
- **UI components:** `apps/web/src/components/ui` is managed by shadcn – add components with `pnpm dlx shadcn@latest add <name>` from `apps/web`.

## Adding a background job

1. Define the queue in [`packages/jobs/src/index.ts`](packages/jobs/src/index.ts): name, Zod payload schema and retry options.
2. Write a handler in `apps/worker/src/handlers/` and register it in `apps/worker/src/index.ts` with `registerWorker`.
3. Enqueue it from the server with `enqueue(ctx.boss, "<queue>", payload)`.
4. Track progress on the domain table (e.g. a `status` column) rather than on pg-boss internals, so the UI can show it.

Queues are created automatically when server or worker start.

## License

By contributing you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
