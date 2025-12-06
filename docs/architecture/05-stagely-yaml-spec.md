# stagely.yaml Configuration Reference

## Overview

`stagely.yaml` is the declarative configuration file that defines how Stagely should build, deploy, and test your application. It must be placed in the root of your Git repository.

Unlike proprietary CI/CD configs, `stagely.yaml` is designed to work alongside your existing `docker-compose.yml` without replacing it. It focuses on orchestration, not implementation.

## Schema Version

Current version: `2`

```yaml
version: 2
```

**Versioning Policy:**

- Major version changes indicate breaking schema changes
- Minor version changes add optional fields (backward-compatible)
- Stagely Core rejects configs with unsupported major versions

## Full Example (Monorepo with Multi-Arch)

```yaml
version: 2

# Project metadata
name: "My Full-Stack App"
description: "A demo application with frontend, backend, and worker"

# Build phase: Define artifacts to build
builds:
  # Backend service (AMD64 only)
  backend:
    context: "./api"
    dockerfile: "Dockerfile"
    platform: "linux/amd64"
    machine: "medium"
    build_args:
      NODE_ENV: "staging"
      API_VERSION: "1.2.3"
    cache_from:
      - "registry.internal/project/cache:backend"
    timeout: "20m"

  # Worker service (Multi-arch: AMD64 + ARM64)
  worker:
    context: "./worker"
    dockerfile: "Dockerfile.worker"
    platforms:
      - "linux/amd64"
      - "linux/arm64"
    machine: "small"

  # Frontend (AMD64 only, large machine for heavy webpack build)
  frontend:
    context: "./web"
    dockerfile: "Dockerfile"
    platform: "linux/amd64"
    machine: "large"
    build_args:
      NEXT_PUBLIC_API_URL: "https://${STAGELY_HASH}.stagely.dev/api"

# Preview phase: How to run the built images
preview:
  size: "large" # VM size for the preview stagelet

  # Lifecycle hooks (run before opening traffic)
  lifecycle:
    on_start:
      - service: "backend"
        command: "npm run db:migrate"
      - service: "backend"
        command: "npm run db:seed"

# Test phase: E2E tests to run after preview is ready
test:
  enabled: true
  image: "mcr.microsoft.com/playwright:v1.40.0"
  machine: "large"
  commands:
    - "npm ci"
    - "npx playwright test --reporter=html"
  artifacts:
    - "./playwright-report/**"
  env:
    BASE_URL: "${STAGELY_PREVIEW_URL}"
    CI: "true"
```

## Section: `builds`

Defines the Docker images to build. Each key is a unique build name.

### Single-Architecture Build

```yaml
builds:
  api:
    context: "./backend"
    dockerfile: "Dockerfile"
    platform: "linux/amd64"
    machine: "medium"
```

**Fields:**

| Field        | Type   | Required | Description                                                 |
| ------------ | ------ | -------- | ----------------------------------------------------------- |
| `context`    | string | Yes      | Path to build context (relative to repo root)               |
| `dockerfile` | string | No       | Path to Dockerfile (default: `{context}/Dockerfile`)        |
| `platform`   | string | Yes      | Target platform: `linux/amd64` or `linux/arm64`             |
| `machine`    | string | No       | VM size: `small`, `medium`, `large` (default: `medium`)     |
| `build_args` | map    | No       | Build-time variables (passed to `docker build --build-arg`) |
| `cache_from` | list   | No       | Docker registry URLs to use as cache sources                |
| `timeout`    | string | No       | Max build time (default: `30m`, format: `10m`, `1h`, `90s`) |

### Multi-Architecture Build

To build a single image that works on both Intel and ARM:

```yaml
builds:
  universal_app:
    context: "."
    platforms:
      - "linux/amd64"
      - "linux/arm64"
    machine: "medium"
```

**Result:** Stagely provisions two VMs (one AMD64, one ARM64), builds both, and merges them into a single manifest list.

**Notes:**

- Cannot specify `platform` and `platforms` simultaneously (use one or the other)
- `machine` size applies to all platform builds
- Build time is determined by the slowest architecture

### Build Args

Pass dynamic values to Dockerfile:

```yaml
builds:
  app:
    context: "."
    build_args:
      NODE_ENV: "staging"
      COMMIT_SHA: "${COMMIT_HASH}" # Stagely variable (injected at runtime)
```

In Dockerfile:

```dockerfile
ARG NODE_ENV
ARG COMMIT_SHA
RUN echo "Building ${NODE_ENV} version ${COMMIT_SHA}"
```

### Cache Configuration

Speed up rebuilds by reusing layers:

```yaml
builds:
  app:
    context: "."
    cache_from:
      - "registry.internal/my-project/cache:main"
      - "registry.internal/my-project/cache:develop"
```

Stagely automatically configures `--cache-to` to push updated layers back.

### Machine Sizes

| Size   | vCPU | RAM   | Typical Use Case                  |
| ------ | ---- | ----- | --------------------------------- |
| small  | 2    | 4 GB  | Go/Rust builds                    |
| medium | 4    | 8 GB  | Node.js/Python                    |
| large  | 8    | 16 GB | Heavy webpack, multi-stage builds |

**Cost Implications:**

- Small: ~$0.02 per 10-minute build
- Medium: ~$0.03 per 10-minute build
- Large: ~$0.06 per 10-minute build

## Section: `preview`

Defines how to run the built images in the Preview stagelet.

```yaml
preview:
  size: "medium"
  lifecycle:
    on_start:
      - service: "backend"
        command: "npm run db:migrate"
```

**Fields:**

| Field       | Type   | Required | Description                                          |
| ----------- | ------ | -------- | ---------------------------------------------------- |
| `size`      | string | No       | VM size for the preview stagelet (default: `medium`) |
| `lifecycle` | object | No       | Hooks to run before traffic is enabled               |

### VM Sizes (Preview)

| Size   | vCPU | RAM   | Disk   | Cost/Hour |
| ------ | ---- | ----- | ------ | --------- |
| small  | 2    | 2 GB  | 25 GB  | ~$0.02    |
| medium | 2    | 4 GB  | 50 GB  | ~$0.04    |
| large  | 4    | 8 GB  | 80 GB  | ~$0.08    |
| xlarge | 8    | 16 GB | 160 GB | ~$0.16    |

### Lifecycle Hooks

Hooks run **after** containers start but **before** the public URL is activated.

#### `on_start`

Run commands inside containers during the first deployment:

```yaml
lifecycle:
  on_start:
    - service: "backend"
      command: "npm run db:migrate"
    - service: "backend"
      command: "npm run db:seed -- --demo-data"
```

**Execution Order:**

1. Agent runs `docker compose up -d`
2. Agent waits for all containers to report "healthy"
3. Agent executes each `on_start` command sequentially
4. If any command fails (exit code != 0):
   - Deployment is marked as "failed"
   - Public URL is NOT activated
   - Error logs are sent to user

**Use Cases:**

- Database migrations
- Cache warming
- Data seeding
- Index creation

**Important:**

- Commands run in the context of the service's container
- They have access to the same stagelet variables as the service
- If a command takes >5 minutes, consider moving it to a background job

## Section: `test`

Defines End-to-End (E2E) tests to run **after** the Preview stagelet is healthy.

```yaml
test:
  enabled: true
  image: "mcr.microsoft.com/playwright:v1.40.0"
  machine: "large"
  commands:
    - "npm ci"
    - "npx playwright test"
  artifacts:
    - "./playwright-report/**"
    - "./test-results/**"
  env:
    BASE_URL: "${STAGELY_PREVIEW_URL}"
```

**Fields:**

| Field       | Type   | Required | Description                                        |
| ----------- | ------ | -------- | -------------------------------------------------- |
| `enabled`   | bool   | No       | Whether to run tests (default: `false`)            |
| `image`     | string | Yes\*    | Docker image to run tests in                       |
| `machine`   | string | No       | VM size (default: `large` for browser-based tests) |
| `commands`  | list   | Yes\*    | Shell commands to execute                          |
| `artifacts` | list   | No       | File paths to save (reports, screenshots)          |
| `env`       | map    | No       | Stagelet variables for test runner                 |
| `timeout`   | string | No       | Max test time (default: `30m`)                     |

\*Required if `enabled: true`

### Test Workflow

1. Preview deployment succeeds
2. Stagely provisions a Tester VM
3. Tester VM pulls the specified `image`
4. Tester VM runs `commands` sequentially
5. If any command exits with non-zero code:
   - Test is marked as "failed"
   - GitHub status check shows red X
6. If all commands succeed:
   - Test is marked as "passed"
   - GitHub status check shows green checkmark
7. Tester VM uploads `artifacts` to Stagely storage
8. Tester VM is terminated

### Using Playwright

```yaml
test:
  enabled: true
  image: "mcr.microsoft.com/playwright:v1.40.0"
  commands:
    - "npm ci"
    - "npx playwright test --reporter=html"
  artifacts:
    - "./playwright-report/**"
  env:
    BASE_URL: "${STAGELY_PREVIEW_URL}"
```

In your Playwright config:

```javascript
// playwright.config.js
export default {
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
  },
};
```

### Using Cypress

```yaml
test:
  enabled: true
  image: "cypress/included:13.6.0"
  commands:
    - "cypress run --record --key ${CYPRESS_RECORD_KEY}"
  artifacts:
    - "./cypress/videos/**"
    - "./cypress/screenshots/**"
  env:
    CYPRESS_BASE_URL: "${STAGELY_PREVIEW_URL}"
```

### Disabling Tests

To skip tests for specific branches:

```yaml
test:
  enabled: false
```

Or configure via Dashboard per-project.

## Variables

Stagely injects dynamic variables at runtime:

| Variable                 | Description        | Example                         |
| ------------------------ | ------------------ | ------------------------------- |
| `${STAGELY_HASH}`        | Unique stagelet ID | `br7x-9jq2`                     |
| `${STAGELY_PREVIEW_URL}` | Full public URL    | `https://br7x-9jq2.stagely.dev` |
| `${COMMIT_HASH}`         | Git commit SHA     | `abc123def456`                  |
| `${BRANCH}`              | Git branch name    | `feature/new-api`               |
| `${PR_NUMBER}`           | GitHub PR number   | `42`                            |
| `${PROJECT_ID}`          | Stagely project ID | `proj_xk82j9s7`                 |

**Usage Example:**

```yaml
builds:
  app:
    build_args:
      SENTRY_RELEASE: "${COMMIT_HASH}"
      BUILD_TIME: "${BUILD_TIMESTAMP}"

test:
  env:
    E2E_URL: "${STAGELY_PREVIEW_URL}"
```

## Advanced Examples

### Monorepo with Shared Dependencies

```yaml
builds:
  shared_lib:
    context: "./packages/shared"
    platform: "linux/amd64"
    machine: "small"

  api:
    context: "./apps/api"
    platform: "linux/amd64"
    machine: "medium"
    depends_on:
      - shared_lib

  web:
    context: "./apps/web"
    platform: "linux/amd64"
    machine: "large"
    depends_on:
      - shared_lib
```

**Note:** `depends_on` is not yet implemented. Currently, all builds run in parallel.

### Database Migrations with Rollback

```yaml
preview:
  lifecycle:
    on_start:
      # Backup database before migration
      - service: "backend"
        command: "npm run db:backup"

      # Run migration
      - service: "backend"
        command: "npm run db:migrate"
```

If migration fails, the Agent automatically stops the deployment. The backup remains in the container's filesystem.

### Custom Test Reports

```yaml
test:
  enabled: true
  image: "node:20"
  commands:
    - "npm ci"
    - "npm run test:e2e -- --reporter=json > report.json"
  artifacts:
    - "./report.json"
    - "./coverage/**"
```

Artifacts are downloadable via Dashboard or API:

```http
GET /api/v1/stagelets/:env_id/artifacts/report.json
```

### Conditional Builds

Use Git branch patterns to skip builds:

```yaml
builds:
  backend:
    context: "./api"
    platform: "linux/amd64"
    only_branches:
      - main
      - develop
      - /^release\/.*/
```

**Note:** `only_branches` is planned but not yet implemented. Currently, all branches trigger builds.

## Validation Rules

Stagely validates `stagely.yaml` before starting any builds:

### Required Fields

- `version` must be `2`
- At least one build must be defined in `builds`
- Each build must have `context` and either `platform` or `platforms`

### Constraints

- Build names must be unique
- Build names must match `^[a-zA-Z0-9_-]+$` (alphanumeric, hyphens, underscores)
- `context` paths must be relative (no absolute paths like `/var/www`)
- `machine` must be one of: `small`, `medium`, `large`, `xlarge`
- `timeout` must be parseable duration (e.g., `10m`, `1h30m`, `90s`)

### Circular Dependencies

If you define `depends_on` (future feature), Stagely detects cycles:

```yaml
builds:
  a:
    depends_on: [b]
  b:
    depends_on: [a] # ERROR: Circular dependency
```

## Error Messages

### Invalid Schema

```yaml
version: 1 # Unsupported version
```

**Error:**

```
stagely.yaml validation failed: unsupported version '1' (supported: 2)
```

### Missing Required Field

```yaml
builds:
  app:
    dockerfile: "Dockerfile" # Missing 'context'
```

**Error:**

```
stagely.yaml validation failed: builds.app.context is required
```

### Invalid Platform

```yaml
builds:
  app:
    context: "."
    platform: "windows/amd64" # Unsupported
```

**Error:**

```
stagely.yaml validation failed: builds.app.platform must be 'linux/amd64' or 'linux/arm64'
```

## Migration from Version 1

Version 1 used a different schema (build commands in YAML). To migrate:

**Old (v1):**

```yaml
version: 1
build:
  - apt-get update
  - npm install
start: "npm start"
```

**New (v2):**

```yaml
version: 2
builds:
  app:
    context: "."
    platform: "linux/amd64"
```

Create a `Dockerfile`:

```dockerfile
FROM node:20
WORKDIR /app
COPY package*.json ./
RUN apt-get update && npm install
COPY . .
CMD ["npm", "start"]
```

**Rationale for Change:**

- V1 was too opinionated (required specific build tooling)
- V2 embraces Docker (universal standard)
- V2 supports multi-arch and caching natively

## Best Practices

### 1. Use `.dockerignore`

Exclude unnecessary files from build context:

```
# .dockerignore
node_modules
.git
*.log
.env
```

**Impact:** Reduces build context upload time by 10-100x.

### 2. Multi-Stage Builds

Keep final images small:

```dockerfile
# Stage 1: Build
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --production
CMD ["node", "dist/server.js"]
```

**Result:** Image size: 200 MB instead of 1.2 GB.

### 3. Cache Dependencies Separately

Leverage Docker layer caching:

```dockerfile
# Copy package files first (changes infrequently)
COPY package*.json ./
RUN npm ci

# Copy source code (changes frequently)
COPY . .
RUN npm run build
```

**Result:** Rebuilds skip `npm ci` if `package.json` unchanged.

### 4. Use Specific Image Tags

Don't use `latest`:

```yaml
test:
  image: "mcr.microsoft.com/playwright:v1.40.0" # Good
  # image: "playwright:latest" # Bad (non-deterministic)
```

### 5. Keep Builds Fast

- Use `machine: large` for heavy builds
- Enable caching (`cache_from`)
- Minimize context size (`.dockerignore`)
- Use `timeout` to catch runaway builds

## Schema Reference (JSON Schema)

For tooling integration, a JSON Schema is available:

```
https://stagely.dev/schemas/stagely-v2.json
```

**Usage in VS Code:**

```json
// .vscode/settings.json
{
  "yaml.schemas": {
    "https://stagely.dev/schemas/stagely-v2.json": "stagely.yaml"
  }
}
```

This enables autocomplete and inline validation.

## Future Features

### Planned for v2.1

- `depends_on` (build ordering)
- `only_branches` (conditional builds)
- `matrix` (build variants: Node 18, 20, 22)

### Planned for v3.0

- `services` section (override docker-compose.yml)
- `volumes` (persistent storage)
- `networks` (custom networking)

## Support

For questions or issues with `stagely.yaml`:

- Documentation: https://docs.stagely.dev
- GitHub Issues: https://github.com/stagely/stagely/issues
- Discord: https://discord.gg/stagely
