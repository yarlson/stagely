# Stagely Core

Stagely is a self-hosted ephemeral preview environment platform that provisions VMs, orchestrates Docker builds, and manages WebSocket-connected agents.

**Current Status:** Phase 0 Complete (Foundation & Database Setup)

## Architecture

- **Backend:** Go 1.22+ with GORM
- **Database:** PostgreSQL 14+
- **Cache:** Redis 7+
- **Encryption:** AES-256-GCM for secrets

## Quick Start

### Prerequisites

- Go 1.22+
- Docker and Docker Compose
- Make
- `migrate` CLI: `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`

### Local Development Setup

1. **Clone the repository:**

```bash
git clone https://github.com/stagely-dev/stagely.git
cd stagely
```

2. **Start dependencies:**

```bash
make docker-up
```

This starts PostgreSQL and Redis containers.

3. **Configure environment:**

```bash
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"
export REDIS_URL="redis://localhost:6379/0"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

4. **Run database migrations:**

```bash
make migrate-up
```

5. **Run the Core API:**

```bash
go run cmd/core/main.go
```

You should see:

```
✅ Database Connected
✅ Configuration Loaded
```

### Running Tests

```bash
# All tests
make test

# Unit tests only
make test-unit

# Integration tests only
make test-integration
```

### Building

```bash
# Build binary
make build

# Run binary
./bin/stagely-core
```

## Project Structure

```
stagely/
├── cmd/
│   └── core/              # Core API entry point
├── internal/
│   ├── config/           # Configuration management
│   ├── crypto/           # Encryption utilities
│   ├── db/               # Database connection
│   └── models/           # GORM models (future)
├── pkg/
│   └── nanoid/           # NanoID generation
├── migrations/           # SQL migrations (14 files)
├── docker-compose.yml    # Local dev environment
└── Makefile             # Build automation
```

## Database Schema

Stagely uses 12 core tables:

- **teams** - Top-level tenants
- **users** - User accounts
- **team_members** - User-team relationships
- **projects** - Git repository configurations
- **cloud_providers** - Encrypted cloud credentials
- **environments** - Preview environments (stagelets)
- **workflow_runs** - Build pipeline tracking
- **build_jobs** - Individual Docker builds
- **build_logs** - Streaming build output
- **secrets** - Encrypted environment variables
- **audit_logs** - Compliance audit trail
- **agent_connections** - Active WebSocket connections

See [docs/architecture/06-database-schema.md](docs/architecture/06-database-schema.md) for details.

## Environment Variables

| Variable         | Required | Default     | Description                               |
| ---------------- | -------- | ----------- | ----------------------------------------- |
| `DATABASE_URL`   | ✅       | -           | PostgreSQL connection string              |
| `REDIS_URL`      | ✅       | -           | Redis connection string                   |
| `PORT`           | ❌       | 8080        | HTTP server port                          |
| `ENVIRONMENT`    | ❌       | development | Environment (development/production)      |
| `LOG_LEVEL`      | ❌       | info        | Log level (debug/info/warn/error)         |
| `ENCRYPTION_KEY` | ⚠️       | -           | 32-byte hex key (required for production) |

## Development Workflow

### Creating a Migration

```bash
make migrate-create NAME=create_my_table
```

### Rolling Back a Migration

```bash
make migrate-down
```

### Linting

```bash
make lint
```

(Requires golangci-lint: `brew install golangci-lint`)

### Cleaning Build Artifacts

```bash
make clean
```

## Testing

### Unit Tests

Fast tests with no external dependencies:

```bash
go test -short ./...
```

### Integration Tests

Tests that require Docker (testcontainers):

```bash
go test -run Integration ./...
```

## Phase 0 Completion Checklist

- [x] Project initialization (go.mod, Makefile, directories)
- [x] Configuration module with Viper
- [x] NanoID utility for subdomain hashes
- [x] AES-256-GCM encryption module
- [x] Database connection with GORM
- [x] 14 SQL migrations (teams, users, projects, environments, etc.)
- [x] Main entry point (cmd/core/main.go)
- [x] Unit and integration tests
- [x] Quality gates (build, lint, test)

## Next Steps (Phase 1)

- [ ] Cloud provider interface (AWS, GCP, DigitalOcean)
- [ ] VM provisioning logic
- [ ] Agent WebSocket protocol
- [ ] Build orchestration

## License

MIT License - see LICENSE file for details
