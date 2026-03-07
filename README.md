# RTM Class Backend

RTM Class Backend is a NestJS API for classroom operations, account management, forums, blogs, and media uploads.

## Tech Stack
- NestJS 10
- Prisma ORM
- PostgreSQL
- Redis
- JWT authentication
- Zod request validation
- Swagger (OpenAPI)
- Cloudinary (file uploads)

## Current Features
- Authentication and authorization
- Role-based access control (`ADMIN`, `TEACHER`, `STUDENT`)
- JWT access + refresh token flow
- Forgot/reset password with OTP flow
- Profile and password management for authenticated users
- Admin user management (create, update, suspend, delete, list)
- Class management (create, join by class code, members, access-based listing)
- Forum discussions with nested replies and upvotes
- Blog system with public read access and admin content management
- File upload integration to Cloudinary
- Unified API response format via global interceptor
- Global exception handling and standardized error responses
- Global request validation with Zod schemas
- Required client-domain guard through `x-client-domain` header
- API versioning (`/api/v1`)

## Project Structure
```text
src/
  auth/
  blogs/
  classes/
  forums/
  uploads/
  users/
  common/
  prisma/
  bootstrap.ts
  swagger.ts
  main.ts
```

## Prerequisites
- Node.js 20+
- npm
- Docker Desktop

## Setup
1. Install dependencies:
```bash
npm install
```
2. Create environment files:
```bash
copy .env.example .env
copy .env.local.example .env.local
```

## Run the Application

### Option 1: Hybrid Local Development (recommended)
Run API locally, keep PostgreSQL and Redis in Docker.

1. Start infrastructure services:
```bash
docker compose up -d postgres redis
```
2. Run API in watch mode:
```bash
npm run start:dev:local
```

### Option 2: Full Docker
Development profile:
```bash
npm run docker:up:dev
```

Production profile:
```bash
npm run docker:up:prod
```

Stop all containers:
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
- keep `DATABASE_URL` host as `postgres`
- keep `REDIS_URL` host as `redis`
5. Run the first deployment manually:
```bash
chmod +x scripts/deploy.sh
APP_DIR=/opt/rtm-class-backend ./scripts/deploy.sh
```

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
# build
npm run build

# lint
npm run lint

# tests
npm run test
npm run test:cov

# prisma
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:seed
npm run prisma:studio
```

## Changelog

### 2026-03-03
- Refactored bootstrap flow by extracting Swagger configuration from `main.ts` into `src/swagger.ts`.
- Added clearer separation of concerns between app initialization (`bootstrap.ts`) and API documentation setup (`swagger.ts`).
- Improved project documentation with a complete English README focused on capabilities and architecture.

### Existing Baseline (from current codebase)
- Implemented auth module with role-aware sign-in variants and refresh/sign-out support.
- Implemented OTP-based forgot/reset password and authenticated password change.
- Added admin-managed users module with suspension controls.
- Added classes module with join-by-code and member listing.
- Added forums module with threaded comments/replies and upvote toggles.
- Added blogs module for public publishing and admin CMS operations.
- Added Cloudinary-based uploads module.
- Added global exception filter, global API response interceptor, and client-domain request guard.
