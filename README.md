# E-commerce API

Robust NestJS + Fastify back end that covers the core flows of a modern e-commerce platform: authentication, catalog, cart, and orders. The service uses PostgreSQL via Prisma ORM, integrates Redis-backed caching when available, applies strong validation and security defaults, and exposes OpenAPI documentation by default in non-production environments.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Application Anatomy](#application-anatomy)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Installation](#installation)
- [Database & Migrations](#database--migrations)
- [Seeding Large Demo Data](#seeding-large-demo-data)
- [Running the App](#running-the-app)
- [Testing](#testing)
- [Linting & Formatting](#linting--formatting)
- [API Documentation](#api-documentation)
- [Production Notes](#production-notes)
- [Troubleshooting](#troubleshooting)
- [Useful Resources](#useful-resources)

## Features

- NestJS 11 application bootstrapped with Fastify for high throughput HTTP handling.
- PostgreSQL persistence through Prisma ORM with a rich schema covering users, products, inventory, carts, and orders.
- JWT-based authentication with refresh tokens, role-based authorization helpers, and rate limiting via `@nestjs/throttler`.
- Optional Redis-backed caching (Keyv + Redis) with automatic fall-back to in-memory cache.
- Strong request validation using global `ValidationPipe` and Joi-powered environment validation.
- Global observability primitives: Pino HTTP logging, custom exception filter, timeout interceptor, graceful shutdown hooks.
- Comprehensive e2e test suite (SuperTest) that covers critical user and admin flows.
- Swagger/OpenAPI docs available at `/docs` during development for interactive exploration.

## Tech Stack

- Runtime: Node.js (TypeScript)
- Framework: NestJS 11 + Fastify 5
- ORM: Prisma Client (PostgreSQL)
- Authentication & Authorization: `@nestjs/jwt`, Passport JWT strategies, Role decorators
- Validation: `class-validator`, `class-transformer`, global pipes, Joi env validation
- Caching: `@nestjs/cache-manager` with Keyv + Redis store (optional)
- Logging: `nestjs-pino` (Pino logger with pretty transport in development)
- Testing: Jest 30, SuperTest, @nestjs/testing utilities
- Tooling: PNPM, ESLint (flat config), Prettier, Nest CLI, TSConfig paths

## Project Structure

```text
.
├─ src/
│  ├─ main.ts                 # Application bootstrap (Fastify adapter, Swagger, global pipes/filters)
│  ├─ app.module.ts           # Root module wiring configuration, caching, throttling, logging
│  ├─ config/
│  │  └─ env.validation.ts    # Joi schema for required environment variables
│  ├─ common/                 # Cross-cutting decorators, guards, filters, interceptors, utils
│  ├─ auth/                   # Auth controller/service, JWT strategies, DTOs, interfaces
│  ├─ users/                  # User domain (controllers, services, DTOs, repositories)
│  ├─ products/               # Product catalog, variants, categories
│  ├─ cart/                   # Shopping cart domain with idempotent operations
│  ├─ orders/                 # Checkout orchestration, order lifecycle, inventory adjustments
│  ├─ health/                 # Liveness/readiness probes backed by Terminus
│  └─ prisma/                 # Prisma service wrapper and transactional helpers
├─ prisma/
│  ├─ schema.prisma           # PostgreSQL data model
│  ├─ migrations/             # Prisma migration history (generated)
│  └─ seed.ts                 # Bulk seed script (faker-powered)
├─ test/
│  ├─ *.e2e-spec.ts           # End-to-end scenarios (user flows, cart behavior, admin products)
│  ├─ helper/test-helper.ts   # Bootstraps Nest test application, shared fixtures
│  └─ jest-e2e.json           # Jest config dedicated to e2e suite
├─ db/
│  ├─ schema.sql              # SQL snapshot of the Prisma schema
│  └─ dbml.txt                # Database diagram source
├─ ENDPOINT.md                # Manually curated endpoint & functional recommendations
├─ prisma.config.ts           # Prisma CLI config (custom path, datasource)
├─ pnpm-workspace.yaml        # PNPM workspace definition
├─ tsconfig*.json             # TypeScript builds configuration
└─ dist/                      # Compiled output (created after `pnpm build`)
```

## Application Anatomy

- **Bootstrap (`src/main.ts`)**: Creates a Fastify-powered Nest app, registers security middleware (`helmet`, `cors`, `compress`), configures Swagger in non-production environments, and attaches global validation, exception handling, and timeout interceptors.
- **AppModule (`src/app.module.ts`)**: Centralizes configuration modules (dotenv + Joi), cache manager with optional Redis, throttling guard (rate limiting), structured logging (`nestjs-pino`), and composes feature modules.
- **Auth Module**: Handles registration, login, and token management with hashed passwords, JWT access + refresh tokens, and role-based guards. Exposes DTOs for payload validation.
- **Catalog Modules (`products`, `cart`, `orders`)**: Encapsulate business logic for browsing products, managing carts, processing orders, and synchronizing inventory movements.
- **Common Layer**: Shared utilities such as `GlobalExceptionFilter`, custom decorators for current user extraction, guards for roles permissions, and interceptors (timeouts, response transformations).
- **Prisma Module**: Wraps PrismaClient to add lifecycle hooks, connection logging, and helper methods for converting BigInt to JSON-safe structures.
- **Health Module**: Terminus-based readiness checks to integrate with orchestration platforms (e.g., Kubernetes).

Refer to `ENDPOINT.md` for a curated list of recommended REST endpoints and behaviors that the application targets.

## Prerequisites

- Node.js 20.11+ (recommended 22.x). Enable Corepack to manage PNPM: `corepack enable`.
- PNPM 9+ (`corepack prepare pnpm@latest --activate`).
- PostgreSQL 14+ instance reachable via `DATABASE_URL`.
- Redis (optional) if you want distributed caching. The app falls back to in-memory cache when `REDIS_URL` is not provided.

## Environment Variables

Copy `.env.example` to `.env` and adjust the values. Required variables are enforced at runtime through Joi validation.

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `NODE_ENV` | No (default `development`) | Runtime environment flag (`development`, `production`, `test`). Controls logging and Swagger. |
| `PORT` | No (default `3000`) | HTTP port exposed by Fastify. |
| `CORS_ORIGINS` | No | Comma-separated list of allowed origins. Leave unset to disable CORS. |
| `THROTTLE_TTL` | No (default `60000`) | Rate limiter window in milliseconds. |
| `THROTTLE_LIMIT` | No (default `100`) | Max requests per IP inside the throttle window. |
| `CACHE_TTL_SECONDS` | No (default `60`) | Global cache TTL for cache-manager (used across services). |
| `REDIS_URL` | No | Redis connection string (`redis://` or `rediss://`). Enables shared cache when present. |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string used by Prisma. Example: `postgresql://user:pass@localhost:5432/ecommerce`. |
| `JWT_SECRET` | **Yes** | Secret key for signing access tokens (min length 16). |
| `JWT_EXPIRES_IN` | No (default `15m`) | Access token lifetime. |
| `JWT_REFRESH_SECRET` | **Yes** | Secret key for refresh tokens (min length 16). |
| `JWT_REFRESH_EXPIRES_IN` | No (default `7d`) | Refresh token lifetime. |

Create environment-specific overrides as needed (e.g., `.env.test` for the Jest e2e suite).

## Installation

```bash
# Install dependencies
pnpm install

# Optional: keep Prisma client types up-to-date
pnpm exec prisma generate
```

## Database & Migrations

Prisma CLI reads configuration from `prisma.config.ts` and `prisma/schema.prisma`.

```bash
# Apply migrations to your dev database (creates if missing)
pnpm exec prisma migrate dev

# Create a new migration after updating schema.prisma
pnpm exec prisma migrate dev --name <migration-name>

# For CI/production deployments
pnpm exec prisma migrate deploy

# Inspect schema visually
pnpm exec prisma studio
```

The `db/` directory keeps an up-to-date SQL snapshot (`schema.sql`) and DBML diagram (`dbml.txt`) for quick reference.

## Seeding Large Demo Data

A bulk seed script (`prisma/seed.ts`) generates a realistic dataset: 50k users, hierarchical categories, thousands of products and variants, and correlated carts and orders.

```bash
# WARNING: This script inserts tens of thousands of rows.
# Ensure your database has enough resources before running.
pnpm db:seed
```

The seed uses Faker with deterministic patterns (e.g., admin roles for first 10 accounts). Update the script if you need smaller sample sizes.

## Running the App

```bash
# Start in watch mode (recommended during development)
pnpm dev

# Start without file watching (development build)
pnpm start

# Production build + run
pnpm build
pnpm start:prod
```

The server listens on `http://localhost:${PORT}` and logs startup details. Swagger UI becomes available at `/docs` when `NODE_ENV !== 'production'`.

## Testing

Jest is configured for both unit and end-to-end testing (`package.json` and `test/jest-e2e.json`).

```bash
# Unit tests
pnpm test

# Unit tests in watch mode
pnpm test:watch

# End-to-end tests (spin up an HTTP server instance)
pnpm test:e2e

# Collect coverage
pnpm test:cov
```

The e2e suite orchestrates full flows (auth login, product browsing, cart operations, admin product management). It relies on helper utilities under `test/helper`.

## Linting & Formatting

```bash
# ESLint (auto-fix enabled by default)
pnpm lint

# Prettier formatting for src/ (adjust glob if needed)
pnpm format
```

Flat ESLint configuration lives in `eslint.config.mjs`, and Prettier rules are defined in `.prettierrc`.

## API Documentation

- Interactive OpenAPI docs: `http://localhost:<PORT>/docs` (disabled in production).
- High-level endpoint reference: `ENDPOINT.md` summarises recommended routes, guards, caching strategies, and idempotency patterns for critical flows.
- Health checks: `/health` exposes readiness/liveness probes via Terminus.

## Production Notes

- Set `NODE_ENV=production` to disable Swagger UI and reduce log verbosity.
- Provide a managed Redis instance to share cache state between pods/instances.
- Run `pnpm exec prisma migrate deploy` during deployments to ensure schema synchronization.
- Consider setting `CORS_ORIGINS` explicitly and running behind a reverse proxy that forwards the original IP (Fastify `trustProxy` is already enabled).
- Use process managers (e.g., PM2, systemd, containers) to supervise the Node process; graceful shutdown handlers are already wired for `SIGTERM`/`SIGINT`.
- Configure observability (Pino log shipping, Prometheus scraping) as required by your platform.

## Troubleshooting

- **Prisma connection errors**: Verify `DATABASE_URL`, check firewall/VPN, and ensure migrations ran. Use `pnpm exec prisma migrate status`.
- **Redis cache issues**: The app logs a warning and automatically falls back to in-memory storage if Redis initialization fails.
- **Validation errors on startup**: Joi schema lists missing/invalid env variables—fix the reported keys and restart.
- **Swagger not reachable**: Confirm you are not in production mode and `PORT` mapping is correct.

## Useful Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Docs](https://www.prisma.io/docs)
- [Fastify Docs](https://fastify.dev/docs/latest/)
- [Jest Testing Guide](https://jestjs.io/docs/getting-started)
- [PNPM CLI](https://pnpm.io/cli/exec)

---

Happy building! Contributions, improvements, and production hardening steps are always welcome.
