# Stagely Implementation Stack

## Overview

This document defines the concrete technology choices, project structure, tooling, and development practices for implementing Stagely. It bridges the architectural design with actual code, specifying:

- Programming languages and frameworks
- Project directory structure
- Third-party libraries and dependencies
- Naming conventions
- Development workflow
- Deployment packaging

**Target Audience:** Engineers implementing the system

## Technology Stack Summary

| Component         | Technology                | Version          | Rationale                                               |
| ----------------- | ------------------------- | ---------------- | ------------------------------------------------------- |
| Backend Core      | Go                        | 1.22+            | Static binary, excellent concurrency, mature cloud SDKs |
| HTTP Framework    | Gin                       | v1.10+           | Fast, lightweight, battle-tested, extensive middleware  |
| WebSocket         | Gorilla WebSocket         | v1.5+            | De facto standard for Go WebSockets                     |
| Database          | PostgreSQL                | 14+              | ACID compliance, JSONB support, mature tooling          |
| ORM               | GORM                      | v1.25+           | Most popular Go ORM, migration support                  |
| Cache             | Redis                     | 7+               | Sub-millisecond routing lookups, TTL support            |
| Redis Client      | go-redis                  | v9+              | Official Redis client for Go                            |
| Frontend          | React + Vite + TypeScript | React 18, Vite 5 | Fast dev server, modern toolchain                       |
| UI Components     | Shadcn/ui + Radix         | Latest           | Accessible primitives, Tailwind styling                 |
| CSS               | Tailwind CSS              | v3.4+            | Utility-first, rapid prototyping                        |
| TLS Management    | certmagic                 | Latest           | Automatic HTTPS, Let's Encrypt integration              |
| Container Runtime | Docker                    | 24+              | Universal standard, docker-compose support              |

## Project Structure

### Root Layout

```
stagely/
├── cmd/                    # Executable entry points
│   ├── core/              # Stagely Core API (Control Plane)
│   ├── proxy/             # Edge Proxy (Data Plane)
│   └── agent/             # VM Agent
├── internal/              # Private application code
│   ├── api/              # HTTP handlers and routes
│   ├── agent/            # Agent execution logic
│   ├── config/           # Configuration management
│   ├── crypto/           # Encryption/decryption
│   ├── models/           # Database models (GORM)
│   ├── providers/        # Cloud provider implementations
│   ├── registry/         # Docker registry client
│   ├── router/           # Proxy routing logic
│   ├── websocket/        # WebSocket hub and handlers
│   └── workflow/         # Build pipeline orchestration
├── pkg/                   # Public packages (if any)
│   └── nanoid/           # URL hash generation
├── web/                   # Frontend application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── lib/
│   │   └── hooks/
│   └── public/
├── migrations/            # Database migrations (sql files)
├── docker/                # Dockerfiles
│   ├── core.Dockerfile
│   ├── proxy.Dockerfile
│   └── agent.Dockerfile
├── scripts/               # Helper scripts
│   ├── dev-setup.sh
│   └── release.sh
├── docs/                  # Architecture documentation
│   └── architecture/
├── .github/               # GitHub Actions workflows
│   └── workflows/
├── docker-compose.yml     # Local development environment
├── go.mod
├── go.sum
├── Makefile              # Build automation
└── README.md
```

### Backend Structure (`internal/`)

```
internal/
├── api/
│   ├── handlers/
│   │   ├── teams.go           # Team CRUD
│   │   ├── projects.go        # Project management
│   │   ├── environments.go    # Environment lifecycle
│   │   ├── secrets.go         # Secret management
│   │   ├── webhooks.go        # GitHub webhook handler
│   │   └── auth.go            # Authentication
│   ├── middleware/
│   │   ├── auth.go            # JWT validation
│   │   ├── cors.go            # CORS headers
│   │   ├── logger.go          # Request logging
│   │   └── ratelimit.go       # Rate limiting
│   └── routes.go              # Route registration
├── models/
│   ├── team.go
│   ├── user.go
│   ├── project.go
│   ├── environment.go         # Stagelet model
│   ├── workflow_run.go
│   ├── build_job.go
│   ├── secret.go
│   └── audit_log.go
├── providers/
│   ├── provider.go            # CloudProvider interface
│   ├── aws.go                 # AWS implementation
│   ├── digitalocean.go        # DigitalOcean implementation
│   ├── hetzner.go             # Hetzner implementation
│   └── mock.go                # Testing mock
├── agent/
│   ├── executor.go            # Command execution
│   ├── compose.go             # docker-compose logic
│   ├── health.go              # Health checking
│   └── override.go            # Generate stagely override file
├── websocket/
│   ├── hub.go                 # WebSocket connection manager
│   ├── client.go              # Client connection wrapper
│   └── messages.go            # Message type definitions
├── workflow/
│   ├── orchestrator.go        # Fan-out/fan-in logic
│   ├── builder.go             # Build job execution
│   └── reaper.go              # Stale resource cleanup
├── crypto/
│   ├── encrypt.go             # AES-256-GCM encryption
│   └── mask.go                # Secret masking in logs
├── config/
│   └── config.go              # Viper configuration loader
└── registry/
    ├── client.go              # Docker registry client
    └── manifest.go            # Multi-arch manifest builder
```

### Frontend Structure (`web/src/`)

```
web/src/
├── components/
│   ├── ui/                    # Shadcn components (auto-generated)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── TeamSwitcher.tsx
│   └── features/              # Domain components
│       ├── teams/
│       │   ├── TeamList.tsx
│       │   └── TeamForm.tsx
│       ├── projects/
│       │   ├── ProjectCard.tsx
│       │   ├── ProjectForm.tsx
│       │   └── ProjectSettings.tsx
│       ├── environments/
│       │   ├── EnvironmentCard.tsx
│       │   ├── EnvironmentLogs.tsx
│       │   └── EnvironmentStatus.tsx
│       └── secrets/
│           ├── SecretList.tsx
│           └── SecretForm.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── TeamDetail.tsx
│   ├── ProjectDetail.tsx
│   ├── EnvironmentDetail.tsx
│   └── Settings.tsx
├── lib/
│   ├── api.ts                 # Axios/Fetch API client
│   ├── utils.ts               # cn() helper, etc.
│   └── ws.ts                  # WebSocket client
├── hooks/
│   ├── useAuth.ts
│   ├── useWebSocket.ts
│   └── useEnvironments.ts
├── types/
│   ├── team.ts
│   ├── project.ts
│   ├── environment.ts
│   └── api.ts                 # API response types
├── App.tsx
├── main.tsx
└── routes.tsx                 # React Router config
```

## Go Dependencies

### Core Dependencies

```go
// go.mod
module github.com/stagely-dev/stagely

go 1.22

require (
    // HTTP Framework
    github.com/gin-gonic/gin v1.10.0
    github.com/gin-contrib/cors v1.7.0

    // Database
    gorm.io/gorm v1.25.7
    gorm.io/driver/postgres v1.5.7
    github.com/jackc/pgx/v5 v5.5.5

    // Redis
    github.com/redis/go-redis/v9 v9.5.1

    // WebSocket
    github.com/gorilla/websocket v1.5.1

    // TLS/Certificates
    github.com/caddyserver/certmagic v0.20.0

    // Cloud Providers
    github.com/aws/aws-sdk-go-v2 v1.26.0
    github.com/aws/aws-sdk-go-v2/service/ec2 v1.152.0
    github.com/digitalocean/godo v1.109.0
    github.com/hetznercloud/hcloud-go/v2 v2.7.0

    // Docker
    github.com/docker/docker v25.0.5+incompatible
    github.com/docker/go-connections v0.5.0

    // Configuration
    github.com/spf13/viper v1.18.2

    // Validation
    github.com/go-playground/validator/v10 v10.19.0

    // Crypto
    golang.org/x/crypto v0.21.0

    // Logging
    github.com/rs/zerolog v1.32.0

    // JWT
    github.com/golang-jwt/jwt/v5 v5.2.1

    // YAML Parsing
    gopkg.in/yaml.v3 v3.0.1

    // NanoID
    github.com/matoous/go-nanoid/v2 v2.0.0
)
```

### Development Dependencies

```go
require (
    // Testing
    github.com/stretchr/testify v1.9.0
    github.com/testcontainers/testcontainers-go v0.29.1

    // Mocking
    github.com/golang/mock v1.6.0

    // Linting
    github.com/golangci/golangci-lint v1.56.2
)
```

## Frontend Dependencies

### Production Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",

    // State Management
    "@tanstack/react-query": "^5.25.0",
    "zustand": "^4.5.2",

    // HTTP Client
    "axios": "^1.6.7",

    // UI Components (Shadcn/ui - installed individually)
    "@radix-ui/react-accordion": "^1.1.2",
    "@radix-ui/react-alert-dialog": "^1.0.5",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-toast": "^1.1.5",

    // Styling
    "tailwindcss": "^3.4.1",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1",

    // Icons
    "lucide-react": "^0.344.0",

    // Utilities
    "date-fns": "^3.3.1"
  }
}
```

### Development Dependencies

```json
{
  "devDependencies": {
    "@types/react": "^18.2.64",
    "@types/react-dom": "^18.2.21",
    "@typescript-eslint/eslint-plugin": "^7.1.1",
    "@typescript-eslint/parser": "^7.1.1",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.18",
    "eslint": "^8.57.0",
    "postcss": "^8.4.35",
    "typescript": "^5.4.2",
    "vite": "^5.1.6"
  }
}
```

## Naming Conventions

### Go Code

**Packages:**

- Lowercase, single word: `models`, `providers`, `workflow`
- Use underscore for multi-word only if necessary: `build_logs` (rare)

**Files:**

- Lowercase with underscores: `cloud_provider.go`, `team_handler.go`
- Test files: `cloud_provider_test.go`

**Types:**

- PascalCase: `CloudProvider`, `WorkflowRun`, `BuildJob`
- Interfaces: Noun or adjective: `CloudProvider`, `Executor`
- Structs: Concrete noun: `AWSProvider`, `PostgresDB`

**Functions:**

- Exported: PascalCase: `CreateEnvironment`, `GenerateToken`
- Private: camelCase: `parseYAML`, `validateConfig`
- Handlers: Prefix with `Handle`: `HandleCreateProject`, `HandleWebhook`

**Constants:**

- PascalCase or ALL_CAPS:

```go
const (
    DefaultPort = 8080
    MaxRetries  = 3
)
```

**Variables:**

- camelCase: `projectID`, `buildStatus`
- Acronyms: `userID` (not `userId`), `apiKey` (not `APIKey` in vars)

### Database Schema

**Tables:**

- Plural, snake_case: `teams`, `workflow_runs`, `build_jobs`

**Columns:**

- snake_case: `subdomain_hash`, `created_at`, `vm_ip`
- Foreign keys: `{table}_id` → `team_id`, `project_id`
- Booleans: Prefix with `is_` or `has_`: `is_active`, `has_ssl`

**Indexes:**

- `idx_{table}_{columns}`: `idx_environments_status`
- Partial: `idx_{table}_{columns}_{condition}`: `idx_environments_status_active`

### API Endpoints

**Format:** `/v1/{resource}/{id}/{subresource}`

**Examples:**

```
GET    /v1/teams
POST   /v1/teams
GET    /v1/teams/:team_slug
PUT    /v1/teams/:team_slug
DELETE /v1/teams/:team_slug

GET    /v1/teams/:team_slug/projects
POST   /v1/teams/:team_slug/projects
GET    /v1/projects/:project_id
GET    /v1/projects/:project_id/environments
POST   /v1/projects/:project_id/environments

DELETE /v1/environments/:environment_id
```

**JSON Keys:**

- snake_case: `subdomain_hash`, `vm_status`, `created_at`

### Frontend

**Files:**

- Components: PascalCase: `TeamList.tsx`, `EnvironmentCard.tsx`
- Utilities: camelCase: `api.ts`, `utils.ts`
- Hooks: camelCase with `use` prefix: `useAuth.ts`, `useEnvironments.ts`

**Components:**

- PascalCase: `TeamSwitcher`, `EnvironmentLogs`
- Prefixes for UI elements: `Button`, `Card`, `Dialog` (Shadcn naming)

**Props:**

- camelCase: `projectId`, `onSubmit`, `isLoading`

**CSS Classes:**

- Tailwind utility classes only (no custom CSS files unless absolutely necessary)

## Configuration Management

### Environment Variables

#### Core Service (`cmd/core/main.go`)

```bash
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/stagely

# Redis
REDIS_URL=redis://localhost:6379/0

# Security
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_KEY=32-byte-hex-encoded-key

# Cloud Providers (Optional - for testing)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
DO_TOKEN=dop_v1_...
HETZNER_TOKEN=...

# GitHub
GITHUB_WEBHOOK_SECRET=...

# Registry
REGISTRY_URL=https://registry.stagely.internal
REGISTRY_USERNAME=stagely
REGISTRY_PASSWORD=...

# Server
PORT=8080
ENVIRONMENT=development
LOG_LEVEL=info
```

#### Proxy Service (`cmd/proxy/main.go`)

```bash
# Redis (read-only)
REDIS_URL=redis://localhost:6379/0

# TLS
TLS_DOMAIN=stagely.dev
TLS_EMAIL=admin@stagely.dev
CERT_STORAGE_PATH=/etc/stagely/certs

# Server
PORT=443
ENVIRONMENT=production
```

#### Agent (`cmd/agent/main.go`)

```bash
# Core API
STAGELY_API_URL=wss://api.stagely.dev/v1/agent/connect

# Identity (injected via Cloud-Init)
AGENT_ID=srv_abc123
AGENT_TOKEN=sk_live_xyz...

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# Logging
LOG_LEVEL=info
```

### Configuration Loading (Viper)

```go
// internal/config/config.go
package config

import (
    "github.com/spf13/viper"
)

type Config struct {
    Database DatabaseConfig
    Redis    RedisConfig
    Server   ServerConfig
    AWS      AWSConfig
    JWT      JWTConfig
}

type DatabaseConfig struct {
    URL string `mapstructure:"DATABASE_URL"`
}

type RedisConfig struct {
    URL string `mapstructure:"REDIS_URL"`
}

type ServerConfig struct {
    Port        int    `mapstructure:"PORT"`
    Environment string `mapstructure:"ENVIRONMENT"`
    LogLevel    string `mapstructure:"LOG_LEVEL"`
}

func Load() (*Config, error) {
    viper.AutomaticEnv()
    viper.SetDefault("PORT", 8080)
    viper.SetDefault("ENVIRONMENT", "development")
    viper.SetDefault("LOG_LEVEL", "info")

    var cfg Config
    if err := viper.Unmarshal(&cfg); err != nil {
        return nil, err
    }

    return &cfg, nil
}
```

## Development Workflow

### Local Development Setup

```bash
# 1. Start dependencies
docker-compose up -d postgres redis registry

# 2. Run migrations
make migrate-up

# 3. Start Core API (terminal 1)
cd cmd/core && go run main.go

# 4. Start Proxy (terminal 2)
cd cmd/proxy && go run main.go

# 5. Start Frontend (terminal 3)
cd web && npm run dev
```

### Makefile

```makefile
.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build all binaries
	go build -o bin/stagely-core ./cmd/core
	go build -o bin/stagely-proxy ./cmd/proxy
	go build -o bin/stagely-agent ./cmd/agent

.PHONY: test
test: ## Run tests
	go test -v -race -coverprofile=coverage.out ./...

.PHONY: lint
lint: ## Run linters
	golangci-lint run

.PHONY: migrate-up
migrate-up: ## Run database migrations
	migrate -path migrations -database "$(DATABASE_URL)" up

.PHONY: migrate-down
migrate-down: ## Rollback last migration
	migrate -path migrations -database "$(DATABASE_URL)" down 1

.PHONY: docker-build
docker-build: ## Build Docker images
	docker build -f docker/core.Dockerfile -t stagely/core:latest .
	docker build -f docker/proxy.Dockerfile -t stagely/proxy:latest .
	docker build -f docker/agent.Dockerfile -t stagely/agent:latest .

.PHONY: dev
dev: ## Start local development environment
	docker-compose up -d
```

### Docker Compose (Local Development)

```yaml
# docker-compose.yml
version: "3.9"

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_USER: stagely
      POSTGRES_PASSWORD: stagely
      POSTGRES_DB: stagely
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  registry:
    image: registry:2
    ports:
      - "5000:5000"
    environment:
      REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: /var/lib/registry
    volumes:
      - registry_data:/var/lib/registry

volumes:
  postgres_data:
  registry_data:
```

## Build and Deployment

### Docker Images

**Core Service (`docker/core.Dockerfile`):**

```dockerfile
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o stagely-core ./cmd/core

FROM alpine:3.19
RUN apk --no-cache add ca-certificates

WORKDIR /app
COPY --from=builder /app/stagely-core .

EXPOSE 8080
CMD ["./stagely-core"]
```

**Agent (`docker/agent.Dockerfile`):**

```dockerfile
FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o stagely-agent ./cmd/agent

FROM alpine:3.19
RUN apk --no-cache add ca-certificates docker-cli

WORKDIR /app
COPY --from=builder /app/stagely-agent .

CMD ["./stagely-agent"]
```

### Release Process

```bash
# scripts/release.sh
#!/bin/bash
set -e

VERSION=$1

if [ -z "$VERSION" ]; then
    echo "Usage: ./scripts/release.sh v1.0.0"
    exit 1
fi

# Build binaries
echo "Building binaries..."
GOOS=linux GOARCH=amd64 go build -o dist/stagely-agent-linux-amd64 ./cmd/agent
GOOS=linux GOARCH=arm64 go build -o dist/stagely-agent-linux-arm64 ./cmd/agent
GOOS=darwin GOARCH=amd64 go build -o dist/stagely-agent-darwin-amd64 ./cmd/agent
GOOS=darwin GOARCH=arm64 go build -o dist/stagely-agent-darwin-arm64 ./cmd/agent

# Build Docker images
echo "Building Docker images..."
docker build -f docker/core.Dockerfile -t stagely/core:${VERSION} .
docker build -f docker/proxy.Dockerfile -t stagely/proxy:${VERSION} .
docker build -f docker/agent.Dockerfile -t stagely/agent:${VERSION} .

# Push to registry
echo "Pushing images..."
docker push stagely/core:${VERSION}
docker push stagely/proxy:${VERSION}
docker push stagely/agent:${VERSION}

echo "Release ${VERSION} complete!"
```

## Testing Strategy

### Unit Tests

```go
// internal/models/environment_test.go
package models

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestGenerateSubdomainHash(t *testing.T) {
    hash := GenerateSubdomainHash()
    assert.Len(t, hash, 12)
    assert.Regexp(t, "^[a-z0-9]+$", hash)
}
```

### Integration Tests (Testcontainers)

```go
// internal/api/handlers/projects_test.go
package handlers

import (
    "testing"
    "github.com/testcontainers/testcontainers-go"
    "github.com/testcontainers/testcontainers-go/wait"
)

func TestCreateProject(t *testing.T) {
    // Start Postgres container
    ctx := context.Background()
    pgContainer, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
        ContainerRequest: testcontainers.ContainerRequest{
            Image:        "postgres:14",
            ExposedPorts: []string{"5432/tcp"},
            WaitingFor:   wait.ForLog("database system is ready"),
            Env: map[string]string{
                "POSTGRES_PASSWORD": "test",
                "POSTGRES_DB":       "test",
            },
        },
        Started: true,
    })
    require.NoError(t, err)
    defer pgContainer.Terminate(ctx)

    // Run tests...
}
```

### E2E Tests (Frontend)

```typescript
// web/e2e/environments.spec.ts
import { test, expect } from "@playwright/test";

test("create environment from PR", async ({ page }) => {
  await page.goto("/projects/my-project");
  await page.click("text=New Environment");
  await page.fill('input[name="pr_number"]', "123");
  await page.click('button:has-text("Create")');

  await expect(page.locator("text=Building...")).toBeVisible();
});
```

## Code Quality Tools

### Go Linting (`.golangci.yml`)

```yaml
linters:
  enable:
    - errcheck
    - gosimple
    - govet
    - ineffassign
    - staticcheck
    - unused
    - gofmt
    - goimports
    - misspell
    - revive

linters-settings:
  govet:
    check-shadowing: true
  gofmt:
    simplify: true
```

### Frontend Linting (`.eslintrc.json`)

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
```

## Monitoring and Observability

### Logging

```go
// internal/api/middleware/logger.go
package middleware

import (
    "github.com/gin-gonic/gin"
    "github.com/rs/zerolog/log"
)

func Logger() gin.HandlerFunc {
    return func(c *gin.Context) {
        log.Info().
            Str("method", c.Request.Method).
            Str("path", c.Request.URL.Path).
            Str("ip", c.ClientIP()).
            Msg("request")

        c.Next()
    }
}
```

### Metrics (Future)

Prometheus integration points:

- Active environment count
- Build queue depth
- WebSocket connection count
- API request duration histogram

### Tracing (Future)

OpenTelemetry integration for distributed tracing across Core → Agent → Cloud Provider.

## Security Practices

### Secret Scanning

Use `git-secrets` or `gitleaks` in pre-commit hooks:

```bash
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

### Dependency Scanning

```bash
# Run on CI
go list -json -m all | nancy sleuth
npm audit
```

### SAST

```bash
# Static analysis
gosec ./...
```

## CI/CD Pipeline

### GitHub Actions (`.github/workflows/ci.yml`)

```yaml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: "1.22"

      - name: Run tests
        run: make test

      - name: Upload coverage
        uses: codecov/codecov-action@v4

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: golangci/golangci-lint-action@v4

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker images
        run: make docker-build
```

## Documentation

### Code Documentation

```go
// Package providers implements cloud provider abstractions.
//
// Each provider must implement the CloudProvider interface to provision
// and manage VMs across different cloud platforms (AWS, DigitalOcean, etc.).
package providers

// CloudProvider defines the interface for cloud infrastructure operations.
type CloudProvider interface {
    // CreateInstance provisions a new VM with the specified configuration.
    // Returns the instance ID and any error encountered.
    CreateInstance(ctx context.Context, spec MachineSpec) (string, error)

    // GetInstanceStatus retrieves the current status and IP of an instance.
    GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error)

    // TerminateInstance destroys a VM and releases its resources.
    TerminateInstance(ctx context.Context, instanceID string) error
}
```

### API Documentation

Use Swagger/OpenAPI (future enhancement):

```bash
go install github.com/swaggo/swag/cmd/swag@latest
swag init -g cmd/core/main.go
```

## Future Enhancements

1. **Helm Charts**: Kubernetes deployment templates
2. **Terraform Modules**: Infrastructure as code for self-hosted deployment
3. **CLI Tool**: `stagely` CLI for local testing and debugging
4. **Plugin System**: Go plugins for custom cloud providers
5. **Multi-Region**: Geo-distributed control plane
6. **gRPC**: Replace WebSocket with gRPC for Agent communication

## Related Documents

- `01-system-overview.md` - High-level architecture
- `06-database-schema.md` - Complete database schema
- `02-agent-protocol.md` - WebSocket protocol specification
- `08-cloud-provider-interface.md` - Provider implementation details
