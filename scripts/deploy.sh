#!/bin/sh

set -eu

APP_DIR="${APP_DIR:-$(pwd)}"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo ".env file is missing in $APP_DIR"
  exit 1
fi

docker compose pull api || true
docker compose --profile prod build api api-migrate
docker compose --profile prod up -d postgres redis
docker compose --profile prod run --rm api-migrate
docker compose --profile prod up -d api
docker compose ps
