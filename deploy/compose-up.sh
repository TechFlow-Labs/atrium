#!/bin/sh
# Deploy the Compose stack from the current checkout.
# Run on the VPS (GitLab Runner tag: docker-deploy). The env file stays on the host.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
ENV_FILE=${ATRIUM_ENV_FILE:-/opt/atrium/.env}
# Keep the named volume (atrium_atrium-data) stable no matter which directory the runner checks out.
export COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:-atrium}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Create it once on the server. See docs/DEPLOYMENT.md." >&2
  exit 1
fi

cd "$ROOT"
docker compose --env-file "$ENV_FILE" up -d --build --remove-orphans

i=0
while [ "$i" -lt 60 ]; do
  if docker compose --env-file "$ENV_FILE" exec -T app node -e "fetch('http://127.0.0.1:38471/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Healthy: http://127.0.0.1:38471/api/health"
    exit 0
  fi
  i=$((i + 1))
  sleep 5
done

echo "App did not become healthy at http://127.0.0.1:38471/api/health" >&2
docker compose --env-file "$ENV_FILE" ps >&2 || true
exit 1
