# Changelog

All notable changes to this project are documented in this file.

This changelog combines:
- committed history from Git (`b2dcb9e` to `0bd8f60`)
- latest local work that is not committed yet (`Unreleased`)

## [Unreleased] - 2026-03-04
Latest local updates in the working tree (not committed yet).

Planned commit scope: `materials` + `ai-jobs` feature delivery, Prisma migrations, Swagger documentation expansion, and README/CHANGELOG refresh.

### Added
- New `materials` module:
  - material listing with access-aware filtering
  - material detail by UUID
  - material creation endpoint (metadata + file URL)
  - AI output listing per material
- New `ai-jobs` module:
  - enqueue AI transform jobs for a material
  - query AI job status/detail by UUID
  - provider callback endpoint for asynchronous job result updates
- New Prisma migrations:
  - `20260304090000_add_materials_ai_jobs`
  - `20260304163000_sync_ai_status_enum`
- New seed coverage for newly introduced domain objects:
  - materials
  - AI jobs
  - AI outputs

### Changed
- Swagger documentation was expanded for click-first usage:
  - richer global description with testing quick-start
  - clearer tag descriptions across all API domains
  - improved operation defaults and examples for common query/path parameters
  - improved UI defaults (`try it out`, operation sorting, tag sorting, expansion behavior)
- Auth request examples were aligned with seeded accounts for immediate testing.
- README was reworked with complete setup, run modes, Swagger usage flow, and module overview.
- Environment examples and package dependencies were updated to support new modules and integrations.
- Application wiring was updated to register newly added modules in NestJS app composition.

### Technical Notes
- Build validated successfully after documentation and Swagger changes (`npm run build`).
- Existing response envelope convention remains intact (`message`, `data`, `meta`, `error`).
- All new resource identifiers and route params remain UUID-based.

## [0bd8f60] - 2026-03-04
`fix: auto-init dev database after docker up`

### Fixed
- Development database initialization is now executed automatically after Docker dev startup, reducing manual setup errors on fresh environments.

### Changed
- Updated Docker-related npm scripts in `package.json` to trigger DB initialization flow after `docker:up:dev` startup path.
- Updated README to document the new automatic initialization behavior.

### Impact
- Faster first-time local setup.
- Lower risk of running API against empty schema/data in dev profile.

## [ba3a322] - 2026-03-04
`upd: swagger desc`

### Changed
- Refined Swagger description content in `src/swagger.ts`.
- Simplified and clarified API documentation text for better readability.

### Impact
- Cleaner onboarding experience in Swagger UI.
- Less ambiguity around request headers and usage expectations.

## [1c1914f] - 2026-03-03
`feat: switch all entity IDs to UUID and align API validation/docs`

### Added
- Large deterministic seed dataset in `prisma/seed.ts` for realistic test data generation across users, classes, forums, blogs, materials, and AI jobs.
- Additional package/tooling updates required for UUID and seed alignment.

### Changed
- Standardized entity identifiers to UUID across the backend domain model.
- Updated Prisma schema and controller validation/docs to consistently enforce UUID format.
- Updated API docs/examples and endpoint metadata to reflect UUID usage in params/query/body fields.
- Updated forum/classes/users/blog endpoints where ID contract or schema examples required UUID alignment.

### Impact
- Better consistency between database model, validation layer, and OpenAPI contract.
- Reduced ID-type mismatch risk across modules and client integrations.

## [e247b46] - 2026-03-03
`feat: refactor and docs`

### Added
- New modular domains:
  - `blogs` module (public + admin controllers)
  - `classes` module
  - `forums` module
- New schema-first validation files (Zod) for multiple modules.
- New client-domain guard (`x-client-domain`) and list-query utilities.
- New Swagger bootstrap/config file (`src/swagger.ts`) with richer API docs infrastructure.
- New pagination schema utilities in common layer.

### Changed
- Refactored legacy DTO-heavy flows toward schema-based validation and cleaner module boundaries.
- Renamed/restructured blog domain from singular `blog` to pluralized `blogs` layout.
- Improved auth controller/service shape and documentation coverage.
- Updated global exception/filter behavior and validation pipe integration.
- Updated container and environment setup (`docker-compose`, env examples, package scripts/deps).
- Expanded README to improve architecture and setup documentation.

### Removed
- Obsolete DTO files replaced by schema-based validation equivalents.
- Legacy `blog/*` folder structure superseded by `blogs/*`.

### Impact
- Better maintainability and clearer domain separation.
- More consistent input validation and API documentation across modules.

## [b2dcb9e] - 2026-03-03
`feat: setup project`

### Added
- Initial NestJS backend project scaffold and build/test tooling.
- Core modules and infrastructure setup:
  - auth
  - users
  - blog
  - uploads
  - prisma
  - mail
- Initial Docker and Docker Compose setup for API + dependencies.
- Initial Prisma schema and base auth migrations.
- Baseline global middleware/interceptor/filter setup.
- Base README and environment templates.

### Impact
- Established the first runnable backend baseline with authentication, user management, blogging, and upload capability.
