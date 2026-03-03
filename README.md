# RTM Class Backend

## Requirements
- Node.js 20+
- npm
- Docker Desktop

## Setup
1. Install dependency:
```bash
npm install
```
2. Copy environment file:
```bash
copy .env.example .env
copy .env.local.example .env.local
```

## Run Options

### 1) Hybrid dev (recommended)
NestJS jalan di lokal, Postgres + Redis di Docker.

1. Start database services:
```bash
docker compose up -d postgres redis
```
2. Run API in watch mode:
```bash
npm run start:dev:local
```
3. API base URL:
```text
http://localhost:5000/api/v1
```

### 2) Full Docker (API + DB + Redis)
Dev profile:
```bash
npm run docker:up:dev
```

Prod profile:
```bash
npm run docker:up:prod
```

Stop containers:
```bash
npm run docker:down
```

## Useful Commands
- Build:
```bash
npm run build
```
- Prisma generate:
```bash
npm run prisma:generate
```
- Prisma migrate (dev):
```bash
npm run prisma:migrate:dev
```
- Test:
```bash
npm run test
```
