# Self-hosting Shuki

Shuki ships as a single Docker image that runs in three roles:

| Service   | Command   | Purpose                                                                  |
| --------- | --------- | ------------------------------------------------------------------------ |
| `migrate` | `migrate` | Applies database migrations, then exits                                  |
| `app`     | `server`  | Web app + API on port 3000                                               |
| `worker`  | `worker`  | Background jobs (can be scaled: `docker compose up -d --scale worker=2`) |

Plus PostgreSQL (with pgvector) and S3-compatible storage. Everything is defined in [`deploy/docker-compose.yml`](../deploy/docker-compose.yml).

## Quick start

```sh
cd deploy
cp .env.example .env
```

Fill in the required values in `.env` – generate each secret with `openssl rand -base64 32`:

- `BETTER_AUTH_SECRET` – signs sessions; changing it signs everyone out
- `POSTGRES_PASSWORD`
- `S3_SECRET_ACCESS_KEY` – used by the bundled storage and by Shuki

```sh
docker compose up -d
```

Open <http://localhost:3000>. The first account becomes the administrator. To close registration afterwards set `ALLOW_REGISTRATION=false` and run `docker compose up -d` again.

## Reverse proxy and HTTPS

Set `APP_URL` to the public URL – it is used for auth cookies and origin checks:

```env
APP_URL=https://shuki.example.com
```

Example with [Caddy](https://caddyserver.com) (automatic HTTPS):

```caddyfile
shuki.example.com {
	reverse_proxy localhost:3000
}
```

Only the app's port needs to be reachable – file uploads and downloads are streamed through the app, so the storage service stays private.

## Storage

By default the compose file runs [RustFS](https://rustfs.com), a lightweight S3-compatible server. To use an external provider instead (AWS S3, Cloudflare R2, Backblaze B2, Hetzner Object Storage, …):

1. Set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and usually `S3_FORCE_PATH_STYLE=false` in `.env`.
2. Remove the `s3` service and the `s3` entries under `depends_on`.

Shuki creates the bucket on startup if it does not exist (your credentials need permission for that, or create it yourself).

## Backups

Back up both the database and the stored files:

```sh
# Database
docker compose exec -T postgres pg_dump -U shuki -Fc shuki > shuki-$(date +%F).dump

# Files (bundled storage volume)
docker run --rm -v shuki_s3-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/shuki-files-$(date +%F).tar.gz -C /data .
```

Restore the database with `pg_restore -U shuki -d shuki --clean`.

## Updates

```sh
docker compose pull
docker compose up -d
```

Migrations run automatically via the `migrate` service before the app and worker start. To pin a version set `SHUKI_IMAGE=ghcr.io/julian-schaefer/shuki:<version>` in `.env`.

To build the image from source instead: `docker compose build`.

## AI features (optional)

Semantic search and summaries (coming soon) work with any OpenAI-compatible API. For a fully local setup with [Ollama](https://ollama.com):

```env
AI_BASE_URL=http://ollama:11434/v1
AI_EMBEDDING_MODEL=nomic-embed-text
AI_CHAT_MODEL=llama3.1
```

Without `AI_BASE_URL` all AI features stay disabled.

## Configuration reference

| Variable                                                           | Default                 | Description                                                                         |
| ------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `APP_URL`                                                          | `http://localhost:3000` | Public URL of the instance                                                          |
| `PORT`                                                             | `3000`                  | Host port the app is published on                                                   |
| `BETTER_AUTH_SECRET`                                               | –                       | **Required.** At least 32 characters                                                |
| `ALLOW_REGISTRATION`                                               | `true`                  | Allow sign-ups after the first (admin) account                                      |
| `POSTGRES_PASSWORD`                                                | –                       | **Required.** Database password                                                     |
| `S3_ENDPOINT`                                                      | `http://s3:9000`        | S3 API endpoint                                                                     |
| `S3_REGION`                                                        | `us-east-1`             | S3 region                                                                           |
| `S3_BUCKET`                                                        | `shuki`                 | Bucket name                                                                         |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`                        | –                       | **Required.** S3 credentials                                                        |
| `S3_FORCE_PATH_STYLE`                                              | `true`                  | Path-style URLs (needed for most self-hosted S3 servers)                            |
| `MAX_UPLOAD_MB`                                                    | `100`                   | Maximum upload size                                                                 |
| `CLIPPER_ALLOW_PRIVATE_NETWORKS`                                   | `false`                 | Allow saving websites from private/internal networks (keep off on shared instances) |
| `WORKER_CONCURRENCY`                                               | `2`                     | Jobs processed in parallel per worker                                               |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_EMBEDDING_MODEL`, `AI_CHAT_MODEL` | –                       | Optional AI provider                                                                |
| `LOG_LEVEL`                                                        | `info`                  | `debug`, `info`, `warn`, `error`                                                    |
