# Changelog

All notable changes to this project are documented in this file.

This changelog combines:
- committed history from Git
- latest local work in the current working tree

## [2026-03-04] - Local Working Tree (Not Yet Committed)
### Added
- New domain modules:
  - `assignments` (timeline/list/detail/create/publish/submit/list submissions/grade/gradebook/delete)
  - `analytics` (class dashboard metrics endpoint)
  - `admin-moderation` (admin delete/moderation endpoints across content)
- Blog comments support:
  - public list/create/reply
  - admin delete comment
- Prisma schema expansion:
  - added `Assignment`
  - added `AssignmentSubmission`
  - added `BlogComment`
  - added related enums and relation mappings
- New Prisma migration:
  - `20260304190000_add_assignments_blog_comments`
- Seed data expansion:
  - seeded assignments, submissions, grading states, and blog comments
  - seeded gradebook-related score data for assignment analytics/recap
- Postman environment and collection variables for new modules:
  - `ASSIGNMENT_ID`, `SUBMISSION_ID`, `BLOG_COMMENT_ID`, `BLOG_SLUG`

### Changed
- App module wiring and Swagger tags updated to register new modules and routes.
- Postman collection documentation upgraded to ultra-strict endpoint contracts:
  - access/header/path/query/body contracts
  - frontend payload checklist
  - URL/body examples
  - domain-specific success response examples
  - endpoint error matrix
- README updated with mail behavior guidance and published Postman docs link:
  - `https://documenter.getpostman.com/view/14021625/2sBXcKCJeu`
- Mail service hardening for dev stability:
  - SMTP transport made configurable through env
  - non-strict mode logs mail failure without breaking forgot-password flow
  - added toggles like `EMAIL_STRICT_MODE` and `EMAIL_DISABLE_SEND`
  - updated OTP email subject to English (`RTM Class Password Reset OTP`)
- Environment documentation updates:
  - `.env.example` now includes detailed mail config keys:
    - `EMAIL_FROM`
    - `EMAIL_PROVIDER`
    - `EMAIL_HOST`
    - `EMAIL_PORT`
    - `EMAIL_SECURE`
    - `EMAIL_REQUIRE_TLS`
    - `EMAIL_TLS_REJECT_UNAUTHORIZED`
    - `EMAIL_STRICT_MODE`
    - `EMAIL_DISABLE_SEND`
  - `.env.local.example` includes local-safe mail defaults and send bypass guidance
- Grading and score recap are now explicitly documented in API changes:
  - submission grading endpoint behavior
  - class gradebook recap endpoint
  - analytics linkage with graded submissions

### Technical Notes
- Build validated successfully after module and mail updates (`npm run build`).
- Existing response envelope convention remains intact (`message`, `data`, `meta`, `error`).
- All new resource identifiers and route params remain UUID-based.

## [4150183] - 2026-03-04
`upd: changelog`

### Changed
- Updated changelog structure and content quality for clearer release tracking.
- Improved detail level for recent backend updates and documentation updates.

## [37031fc] - 2026-03-04
`feat: add materials and ai-jobs modules with Swagger/docs updates`

### Added
- `materials` module:
  - list materials with access-aware filtering
  - get material detail by UUID
  - create material (metadata + file URL)
  - retrieve AI outputs by material
- `ai-jobs` module:
  - queue AI transform jobs by material
  - inspect AI job detail/status by UUID
  - async callback endpoint for provider result updates
- Prisma migrations:
  - `20260304090000_add_materials_ai_jobs`
  - `20260304163000_sync_ai_status_enum`
- Seed coverage for:
  - materials
  - AI jobs
  - AI outputs

### Changed
- Expanded Swagger docs for click-first testing and clearer endpoint contracts.
- Updated README and API examples for improved onboarding.

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
