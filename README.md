# RTM Class Backend

NestJS backend API for RTM Class platform: authentication, user/class management, forum, blog, materials, AI job orchestration, and file upload.

## Core Stack
- NestJS 10
- Prisma + PostgreSQL
- Redis
- JWT authentication (access + refresh)
- Zod validation
- Swagger OpenAPI
- Cloudinary upload

## Main Features
- Auth flow: sign up, sign in, refresh, sign out
- OTP forgot/reset password flow
- Role-based access (`ADMIN`, `TEACHER`, `STUDENT`)
- Admin users management
- Classes: create, join by class code, members listing
- Materials and AI outputs
- AI jobs queue and dispatch status tracking
- Classroom forums (threads, comments, replies, upvotes)
- Blogs (public read + admin CMS)
- Cloudinary file uploads
- Standardized API response envelope

## API Base URLs
- API base: `http://localhost:5000/api/v1`
- Swagger UI: `http://localhost:5000/docs`
- OpenAPI JSON: `http://localhost:5000/docs-json`
- Postman Published Docs: `https://documenter.getpostman.com/view/14021625/2sBXcKCJeu`

## API Documentation Channels
- Swagger (interactive): best for quick endpoint trial from local environment.
- Postman Published Docs: best for frontend contract review with structured endpoint descriptions, payload examples, success responses, and error matrix.
- Postman Collection JSON: available in `docs-postman/RTM Class Backend.postman_collection.json` for import and team workspace usage.

## Swagger Quick Start (Click-Only)
Swagger is configured for interactive usage like Postman:
- `x-client-domain` header auto-filled and persisted
- Access token auto-captured after successful auth calls
- Bearer auth auto-persisted for protected endpoints
- Request duration shown in UI

Recommended first call:
1. Open `POST /api/v1/auth/sign-in`
2. Use seeded credentials:
   - `email`: `admin.1@rtmclass.test`
   - `password`: `Password123!`
3. Execute, then continue to protected endpoints directly.

Additional seeded examples:
- Admin: `admin.1@rtmclass.test`
- Teacher: `teacher.1@rtmclass.test`
- Student: `student.1@rtmclass.test`
- Default password for seeded users: `Password123!`

## Prerequisites
- Node.js 20+
- npm
- Docker Desktop

## Environment Setup
1. Create env files:
```bash
copy .env.example .env
copy .env.local.example .env.local
```
2. Fill required values (minimum):
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- Mail credentials (`EMAIL_USER`, `EMAIL_APP_PASSWORD`) if testing OTP email
  - For Docker/dev networks, prefer SMTP mode: `EMAIL_PROVIDER=smtp`, `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`, `EMAIL_SECURE=false`, `EMAIL_REQUIRE_TLS=true`
  - To prevent `forgot-password` from failing when SMTP is unreachable, set `EMAIL_STRICT_MODE=false` (default) or fully bypass send with `EMAIL_DISABLE_SEND=true`
- Cloudinary credentials for upload endpoint
- AI integration variables if testing AI endpoints

## Run Options

### Option 1: Local API + Docker DB/Redis (recommended)
```bash
docker compose up -d postgres redis
npm install
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev:local
```

### Option 2: Full Docker Development Profile
```bash
npm run docker:up:dev
```
Detached mode:
```bash
npm run docker:up:dev:detached
```

### Option 3: Full Docker Production Profile
```bash
npm run docker:up:prod
```

Stop containers:
```bash
npm run docker:down
```

## API Docs
- Swagger UI: `http://localhost:5000/docs`
- OpenAPI JSON: `http://localhost:5000/docs-json`

Notes:
- `x-client-domain` header is required for API requests.
- Protected routes require a valid Bearer access token.
- Swagger UI auto-injects `x-client-domain` and can auto-store/reuse the latest access token after successful auth flows.
- All entity IDs in API path/query/body use UUID v4 format (example: `550e8400-e29b-41d4-a716-446655440000`).

## VPS Deployment

This repository is ready for Docker-based deployment to a VPS and supports automatic deployment from GitHub Actions when `main` changes.

### What was fixed for production
- Prisma client is now generated during Docker build, so `docker build` does not fail because of missing Prisma types.
- Email templates are included in the production image, so forgot-password emails do not break at runtime.
- A dedicated `api-migrate` service is available for `prisma migrate deploy` before the API is restarted.

### One-time VPS bootstrap
1. Install Docker Engine with Docker Compose plugin and Git on the VPS.
2. Clone this repository on the VPS to a fixed directory, for example:
```bash
mkdir -p /opt/rtm-class-backend
cd /opt/rtm-class-backend
git clone <your-repository-url> .
```
3. Create the production env file:
```bash
cp .env.example .env
```
4. Edit `.env` for production values:
- set strong JWT secrets
- set real `CORS_ORIGINS`
- set real Cloudinary and email credentials
- if using Docker infra from this compose stack, keep `DATABASE_URL` host as `postgres`
- if using Docker infra from this compose stack, keep `REDIS_URL` host as `redis`
5. Run the first deployment manually:
```bash
chmod +x scripts/deploy.sh
APP_DIR=/opt/rtm-class-backend ./scripts/deploy.sh
```

If your VPS uses external PostgreSQL/Redis (outside this compose stack), run:
```bash
USE_EXTERNAL_INFRA=true APP_DIR=/opt/rtm-class-backend ./scripts/deploy.sh
```
and set `.env` so `DATABASE_URL` and `REDIS_URL` point to the external hosts.

### GitHub Actions auto-deploy
The workflow file is at `.github/workflows/ci-cd.yml`.

On every pull request and push, it runs:
- `npm ci`
- `npx prisma generate`
- `npm run build`
- `npx jest --runInBand`
- `docker build`

On every push to `main`, it also connects to the VPS and runs the deploy script.

Add these GitHub repository secrets:
- `VPS_HOST`
- `VPS_PORT`
- `VPS_USERNAME`
- `VPS_PASSWORD`
- `VPS_APP_DIR`

Example:
- `VPS_HOST=43.157.247.2`
- `VPS_PORT=22`
- `VPS_USERNAME=jidan`
- `VPS_APP_DIR=/opt/rtm-class-backend`

After that, each change merged into `main` will:
1. pull the latest code on the VPS
2. rebuild the Docker images
3. run `prisma migrate deploy`
4. restart the API container

## Development Commands
```bash
# app
npm run start:dev
npm run build
npm run start:prod

# quality
npm run lint
npm run test
npm run test:cov

# prisma
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:seed
npm run prisma:studio
```

## API Modules
- `Auth`
- `Users (Admin)`
- `Classes`
- `Materials`
- `AI Jobs`
- `Forums`
- `Blogs (Public)`
- `Blogs (Admin)`
- `Uploads`
- `System`

## Notes
- Global prefix: `/api`
- API versioning: `/v1`
- Required header for API calls: `x-client-domain`
- Upload endpoint is currently available at `/api/uploads`

## Changelog
Detailed history is in [CHANGELOG.md](CHANGELOG.md).

## Deployment Guide
Detailed deployment steps are in [DEPLOYMENT.md](DEPLOYMENT.md).
