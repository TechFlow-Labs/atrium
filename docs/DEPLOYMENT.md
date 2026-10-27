# Deployment

Atrium runs as two processes against PostgreSQL 16. The Compose file is meant for Coolify with Traefik already on the host network. Do not point Coolify at a `convex deploy` workflow. This application does not use Convex.

## Services

- `postgres` creates `atrium_migrator` (superuser, migrations only), `atrium_app` (no bypass RLS), and `atrium_worker` (bypass RLS).
- `migrate` applies `db/migrations` once and exits.
- `app` serves Next.js on port 38471 and exposes `/api/health`.
- `worker` drains jobs and the outbox. Leave `EMBEDDED_WORKER` unset in production so the web process does not also hold the worker connection.

Traefik labels route `Host(\`${ATRIUM_HOST}\`)` to port 38471 with TLS. Set `BETTER_AUTH_URL` to the public https origin. Coolify should terminate TLS at Traefik and forward the original host.

## Environment

Set these once when the stack is created. Compose reads them and builds every database URL from the role passwords, so you never set `DATABASE_URL*` yourself.

Generate the secrets with `openssl rand -base64 32`.

### Required

| Variable | Used by | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | postgres | Superuser password. |
| `APP_PASSWORD` | postgres, app, worker | Password for `atrium_app`, the RLS-bound role. |
| `WORKER_PASSWORD` | postgres, worker | Password for `atrium_worker`. |
| `MIGRATE_PASSWORD` | postgres, migrate | Password for `atrium_migrator`. |
| `BETTER_AUTH_SECRET` | app | Signs sessions. Changing it signs everyone out. |
| `BETTER_AUTH_URL` | app | Public origin, for example `https://atrium.example.com`. Provider callbacks and MCP URLs derive from it. |
| `CREDENTIAL_ENCRYPTION_KEY` | app, worker | Encrypts stored provider tokens. Back it up. Losing it makes saved tokens unreadable. |
| `ATRIUM_HOST` | app (Traefik label) | Public hostname without a scheme, for example `atrium.example.com`. |

The role passwords must not contain single quotes. `docker/postgres/init.sh` runs only on the first database boot, so changing a role password later means updating the role with `ALTER ROLE` as well as the environment variable.

### Optional

| Variable | Default | Notes |
| --- | --- | --- |
| `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET` | blank | Enables OAuth for Linear. |
| `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET` | blank | Enables OAuth for Jira. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | blank | Enables OAuth for GitHub. |
| `GITLAB_CLIENT_ID`, `GITLAB_CLIENT_SECRET` | blank | Enables OAuth for GitLab. |
| `GITEA_CLIENT_ID`, `GITEA_CLIENT_SECRET` | blank | Enables OAuth for Gitea. |
| `GITEA_SITE_URL` | `https://gitea.com` | Set for a self-hosted Gitea. |
| `ALLOW_FAKE_PROVIDER` | `false` | Keep `false` in production. |
| `SMTP_HOST` | blank | Mail host for password reset. Production: `linux230.papaki.gr`. |
| `SMTP_PORT` | `465` | `465` is implicit TLS. Use `587` only with `SMTP_SECURE=false` (STARTTLS). |
| `SMTP_SECURE` | on for port 465 | Set `true` for implicit TLS. |
| `SMTP_USER` | blank | Mailbox username. Production: `support@techflowlabs.gr`. |
| `SMTP_PASSWORD` | blank | Mailbox password. Set it in the server environment. Do not commit it. |
| `SMTP_FROM` | blank | From header. Production: `Atrium <support@techflowlabs.gr>`. |

Password reset stays disabled in production until `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` are all set. Copy the password from the existing Dify, Docmost, or LiteLLM env on the same host. Those apps already send as `support@techflowlabs.gr` through `linux230.papaki.gr`. Restart the app container after changing them.

There are two ways to set the OAuth client ID and secret:

- **Deployment:** set the `*_CLIENT_ID` and `*_CLIENT_SECRET` variables in the container environment, and restart the app.
- **Workspace settings:** an owner or admin adds them on the Integrations page, under OAuth apps. The secret is encrypted with `CREDENTIAL_ENCRYPTION_KEY` and never shown again.

Values saved in a workspace take priority. The deployment variables are the fallback, so an existing setup keeps working. Without either, an admin can paste a provider access token instead. That token is encrypted before it is stored. Register apps and callback URLs as described in [OAUTH.md](./OAUTH.md), using `pnpm oauth:redirects` to print them. Minimum scopes when OAuth is configured:

- Linear: `read`, `write`
- Jira: `read:jira-work`, `write:jira-work`, `offline_access`
- GitHub: classic `repo` (issues on private repositories)
- GitLab: `api`, `read_user`

### Set by Compose, do not set

- `EMBEDDED_WORKER` is forced to `false` for the app, so the worker runs only in its own container.
- `NODE_ENV` is `production`.
- `DATABASE_URL`, `DATABASE_URL_WORKER`, and `DATABASE_URL_MIGRATE` are built from the role passwords.

### Not needed for a container deployment

- `OBSIDIAN_VAULT_ROOT` only matters when the container can read a LiveSync mirror from its own filesystem. The remote vault bridge needs nothing from the container.
- `NEXT_PUBLIC_APP_NAME` from `.env.example` is not read by the code.

### Never run in production

`pnpm db:seed` creates demo accounts with a known password. Do not run it against a deployed database.

## Local commands

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm worker
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

`pnpm dev` listens on `127.0.0.1:38471`. With `EMBEDDED_WORKER=true` in `.env.local`, the Next.js process also drains the queue so a second terminal is optional.

## Production build

```bash
docker compose build
docker compose up -d
```

The Dockerfile has three stages. `build` installs everything and runs `next build`. `deps` installs production dependencies only. `runtime` copies the Next.js standalone server, `src`, `scripts`, and `db`, and runs as the non-root `node` user.

The web container starts with `node standalone/server.js`. The `migrate` and `worker` services override the command with `pnpm db:migrate` and `pnpm worker`.

Compose starts `migrate` before `app`, and `worker` after `app` is healthy. Postgres is not published on a host port.

### Before the first deploy

1. Create the stack with the required variables above.
2. Confirm `https://<ATRIUM_HOST>/api/health` returns `{"ok":true}`.
3. Sign up the first account in the browser. Do not seed.

## Deploy on push to main

GitLab CI deploys this repo when `main` is pushed. Ansible and GoCD are not involved. The pipeline file is `.gitlab-ci.yml`. The job runs `deploy/compose-up.sh`, which builds and starts Compose, then waits until the app health check passes.

The job is tagged `docker-deploy`. It only runs on a shell runner installed on the VPS, so the runner and the containers share Docker. A GitLab.com shared runner cannot reach the host Docker socket and will not pick up this job. The script pins the Compose project name to `atrium`, so the database volume stays `atrium_atrium-data` across checkouts. `COMPOSE_PROJECT_NAME` overrides that.

### One-time runner setup

On the VPS, after Docker is installed:

1. Install `gitlab-runner` and add that user to the `docker` group.
2. In the Atrium GitLab project, open Settings → CI/CD → Runners and create a runner tagged `docker-deploy`.
3. Register it on the VPS:

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url https://gitlab.com \
  --token YOUR_GLRT_TOKEN \
  --executor shell \
  --description atrium-production
```

4. Write the production env file once, outside the git checkout. Use the required variables from the table above. Do not copy `.env.example`; that file is for local `pnpm dev` and does not contain the Compose variables.

```bash
sudo install -d -m 755 /opt/atrium
sudo tee /opt/atrium/.env >/dev/null <<'EOF'
POSTGRES_PASSWORD=
APP_PASSWORD=
WORKER_PASSWORD=
MIGRATE_PASSWORD=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://atrium.example.com
CREDENTIAL_ENCRYPTION_KEY=
ATRIUM_HOST=atrium.example.com
EOF
sudo chown root:gitlab-runner /opt/atrium/.env
sudo chmod 640 /opt/atrium/.env
```

Fill every value before the first deploy. `ATRIUM_ENV_FILE` overrides that path. The checkout used by the job is GitLab's build directory, not `/opt/atrium`. The named volume `atrium-data` keeps Postgres across deploys.

A push to `main` then runs the job. Do not seed the production database.
