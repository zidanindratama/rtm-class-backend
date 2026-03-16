#!/bin/sh

set -eu

APP_DIR="${APP_DIR:-$(pwd)}"
USE_EXTERNAL_INFRA="${USE_EXTERNAL_INFRA:-false}"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo ".env file is missing in $APP_DIR"
  exit 1
fi

docker compose pull api || true
docker compose --profile prod build api api-migrate

if [ "$USE_EXTERNAL_INFRA" = "true" ]; then
  echo "USE_EXTERNAL_INFRA=true -> skip postgres/redis containers"
  docker compose --profile prod run --rm --no-deps api-migrate
  docker compose --profile prod up -d --no-deps api
else
  docker compose --profile prod up -d postgres redis
  docker compose --profile prod run --rm api-migrate
  docker compose --profile prod up -d api
fi

docker compose ps
