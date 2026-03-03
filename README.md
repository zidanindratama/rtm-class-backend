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
