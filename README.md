# Stagely

Self-hosted ephemeral preview environments with full VM control across multiple cloud providers.

Stagely creates production-like testing environments for every Pull Request, giving you complete root access and multi-cloud flexibility. Unlike container-only platforms, Stagely provisions full VMs in your own cloud account, enabling you to test database migrations, system-level dependencies, and complex multi-service architectures.

## Features

- **Full VM Control** - Root access, kernel-level control, complete system access
- **Multi-Cloud Support** - Works with AWS EC2, DigitalOcean, and Hetzner Cloud
- **Bring Your Own Cloud** - Uses your cloud credentials, reducing platform costs
- **Docker-Native** - Standard `docker-compose.yml` - no proprietary configuration
- **Ephemeral by Design** - Automatic cleanup when PRs close or TTL expires
- **Multi-Architecture** - Build and deploy for amd64 and arm64
- **Secure by Default** - AES-256-GCM encryption, RBAC, audit logging

## Architecture

### System Overview

```
┌─────────────────────────────────────────────┐
│         Control Plane (Private)             │
│  ┌────────────┐  ┌──────────┐  ┌─────────┐  │
│  │ Core API   │  │ Postgres │  │ Redis   │  │
│  │ (Go/Gin)   │  │          │  │         │  │
│  └────────────┘  └──────────┘  └─────────┘  │
│  ┌────────────┐                             │
│  │ Registry   │                             │
│  └────────────┘                             │
└─────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────┐
│         Data Plane (Public)                 │
│  ┌────────────────────────────────────────┐ │
│  │ Edge Proxy (*.stagely.dev)             │ │
│  │ Routes to User VMs                     │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────┐
│      User's Cloud Account                   │
│  ┌────────────────────────────────────────┐ │
│  │ Preview VM (AWS/DO/Hetzner)            │ │
│  │  ├─ Stagely Agent (WebSocket)          │ │
│  │  ├─ Docker Engine                      │ │
│  │  └─ App Containers                     │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Technology Stack

**Backend**

- Go 1.22+ with Gin framework
- PostgreSQL 14+ with GORM
- Redis 7+ for routing and caching
- WebSocket (Gorilla) for agent communication

**Frontend**

- React 18 + TypeScript
- Vite build tool
- Tailwind CSS + shadcn/ui
- TanStack Query

**Infrastructure**

- Docker + Docker Compose
- certmagic for wildcard TLS
- Docker Registry v2
- Cloud SDKs: aws-sdk-go-v2, godo, hcloud-go

## Quick Start

### Prerequisites

- Go 1.22+
- Docker and Docker Compose
- Make
- `migrate` CLI: `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`

### Local Development

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

## Configuration

### Environment Variables

| Variable         | Required | Default     | Description                               |
| ---------------- | -------- | ----------- | ----------------------------------------- |
| `DATABASE_URL`   | ✅       | -           | PostgreSQL connection string              |
| `REDIS_URL`      | ✅       | -           | Redis connection string                   |
| `PORT`           | ❌       | 8080        | HTTP server port                          |
| `ENVIRONMENT`    | ❌       | development | Environment (development/production)      |
| `LOG_LEVEL`      | ❌       | info        | Log level (debug/info/warn/error)         |
| `ENCRYPTION_KEY` | ⚠️       | -           | 32-byte hex key (required for production) |

### Project Configuration (stagely.yaml)

Define builds and deployment configuration in your repository:

```yaml
version: 2

builds:
  backend:
    context: "./api"
    dockerfile: "Dockerfile"
    platform: "linux/amd64"
    machine: "medium"

  frontend:
    context: "./web"
    platforms:
      - "linux/amd64"
      - "linux/arm64"
    machine: "large"

preview:
  size: "medium"
  lifecycle:
    on_start:
      - service: "backend"
        command: "npm run db:migrate"

test:
  enabled: true
  image: "mcr.microsoft.com/playwright:v1.40.0"
  commands:
    - "npm ci"
    - "npx playwright test"
```

See [docs/architecture/05-stagely-yaml-spec.md](docs/architecture/05-stagely-yaml-spec.md) for complete specification.

## Project Structure

```
stagely/
├── cmd/
│   └── core/              # Core API entry point
├── internal/
│   ├── config/           # Configuration management
│   ├── crypto/           # AES-256-GCM encryption
│   ├── db/               # Database connection
│   └── models/           # GORM models
├── pkg/
│   └── nanoid/           # NanoID generation
├── web/                  # React frontend
├── migrations/           # SQL migrations
├── docs/
│   ├── architecture/     # System architecture docs
│   └── roadmap/          # Implementation roadmap
├── docker-compose.yml    # Local dev environment
└── Makefile             # Build automation
```

## Database Schema

Stagely uses 12 core tables:

- **teams** - Top-level tenants for multi-tenancy
- **users** - User accounts with OAuth support
- **team_members** - User-team relationships with RBAC
- **projects** - Git repository configurations
- **cloud_providers** - Encrypted cloud credentials
- **environments** - Preview environments (stagelets)
- **workflow_runs** - Build→Deploy→Test pipeline tracking
- **build_jobs** - Individual Docker builds per architecture
- **build_logs** - Streaming build output
- **secrets** - Encrypted environment variables and files
- **audit_logs** - Compliance audit trail
- **agent_connections** - Active WebSocket connections

See [docs/architecture/06-database-schema.md](docs/architecture/06-database-schema.md) for complete schema documentation.

## Development Workflow

### Creating a Migration

```bash
make migrate-create NAME=create_my_table
```

Edit the generated files in `migrations/`, then:

```bash
make migrate-up
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

## How It Works

### Workflow: PR Opened

1. **GitHub webhook** triggers Stagely Core
2. **Parse `stagely.yaml`** to determine build targets
3. **Fan-Out: Build Phase**
   - Provision builder VMs (one per build target per architecture)
   - Build Docker images in parallel
   - Push to internal registry
4. **Fan-In: Synchronize** - Wait for all builds to complete
5. **Deploy Phase**
   - Provision preview VM in user's cloud account
   - Install Stagely Agent via Cloud-Init
   - Agent pulls images and runs `docker-compose up`
6. **Health Check** - Agent reports container status
7. **Update Redis** routing: `route:abc123 → VM_IP:3000`
8. **Post GitHub comment** with preview URL

### Workflow: Traffic Routing

```
User Request: https://abc123.stagely.dev
         ↓
Edge Proxy (queries Redis)
         ↓
Redis: route:abc123 → 10.0.1.42:3000
         ↓
Forward to Preview VM
         ↓
App Response
```

### Workflow: PR Closed

1. **GitHub webhook** triggers cleanup
2. **Agent sends SIGTERM** to containers
3. **VM terminated** in cloud provider
4. **DNS entry removed** from Redis
5. **Database records soft-deleted**

## Cloud Provider Support

Stagely provides a unified interface across multiple cloud providers:

### Supported Providers

- **AWS EC2** - Using aws-sdk-go-v2
- **DigitalOcean Droplets** - Using godo SDK
- **Hetzner Cloud** - Using hcloud-go SDK

### Instance Size Mapping

| Size   | AWS       | DigitalOcean | Hetzner | vCPU | RAM |
| ------ | --------- | ------------ | ------- | ---- | --- |
| small  | t3.small  | s-1vcpu-2gb  | cx11    | 1-2  | 2GB |
| medium | t3.medium | s-2vcpu-4gb  | cx21    | 2    | 4GB |
| large  | t3.large  | s-4vcpu-8gb  | cx31    | 4    | 8GB |

### Architecture Support

- **amd64** (x86_64) - All providers
- **arm64** (aarch64) - AWS Graviton, DigitalOcean Premium AMD

## Security

### Encryption

- **Secrets at Rest** - AES-256-GCM encryption for all sensitive data
- **Secret Masking** - Secrets replaced with `***REDACTED***` in logs
- **Key Rotation** - Support for rotating encryption keys

### Authentication & Authorization

- **JWT Authentication** - Token-based API access
- **OAuth Support** - GitHub and Google OAuth
- **RBAC** - Four roles: owner, admin, member, viewer

### Audit Logging

All sensitive operations tracked:

- User authentication
- Secret access
- Environment provisioning
- Configuration changes

### Network Security

- **Control Plane** - Private (internal only)
- **Edge Proxy** - Public (HTTPS only)
- **Agent WebSocket** - JWT-authenticated handshake

## Testing

### Test Structure

```bash
# Unit tests (no external dependencies)
go test -short ./...

# Integration tests (requires Docker)
go test -run Integration ./...
```

### Testing Tools

- **testify** - Assertions and mocking
- **testcontainers-go** - Integration testing with real PostgreSQL
- **httptest** - HTTP handler testing

## Documentation

### Architecture Docs

- [System Overview](docs/architecture/01-system-overview.md)
- [Agent Protocol](docs/architecture/02-agent-protocol.md)
- [Secrets Management](docs/architecture/03-secrets-management.md)
- [Build Pipeline](docs/architecture/04-build-pipeline.md)
- [stagely.yaml Spec](docs/architecture/05-stagely-yaml-spec.md)
- [Database Schema](docs/architecture/06-database-schema.md)
- [Edge Proxy Routing](docs/architecture/07-edge-proxy-routing.md)
- [Cloud Provider Interface](docs/architecture/08-cloud-provider-interface.md)
- [Implementation Stack](docs/architecture/09-implementation-stack.md)

### Roadmap

- [Core Roadmap](docs/roadmap/2025-12-06-stagely-core-roadmap.md) - 9-phase implementation plan
- [Phase 0 Report](docs/roadmap/2025-12-06-phase-0-foundation-report.md) - Foundation completion
- [Phase 1 Design](docs/roadmap/2025-12-07-phase-1-cloud-providers-design.md) - Cloud providers design

## Implementation Progress

Stagely is being built in 9 phases:

- [x] **Phase 0: Foundation** - Project setup, database, encryption, configuration
- [ ] **Phase 1: Cloud Providers** - VM provisioning across AWS, DigitalOcean, Hetzner
- [ ] **Phase 2: HTTP API** - REST API, authentication, RBAC
- [ ] **Phase 3: WebSocket Hub** - Agent communication, message routing
- [ ] **Phase 4: Build Pipeline** - Multi-architecture Docker builds
- [ ] **Phase 5: Environment Deployment** - Preview VM lifecycle management
- [ ] **Phase 6: Secrets Management** - Injection, scoping, masking
- [ ] **Phase 7: Monitoring** - Reaper process, automatic cleanup
- [ ] **Phase 8: Docker Registry** - Private registry, image caching
- [ ] **Phase 9: Observability** - Logging, metrics, tracing

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `make test`
5. Commit: `git commit -am 'Add my feature'`
6. Push: `git push origin feature/my-feature`
7. Open a Pull Request

### Code Quality

All commits must pass:

- `make build` - Successful compilation
- `make lint` - No linting errors
- `make test` - All tests passing

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/stagely-dev/stagely/issues)
- **Discussions**: [GitHub Discussions](https://github.com/stagely-dev/stagely/discussions)
- **Documentation**: [docs/](docs/)

## Acknowledgments

Built with modern Go practices and inspired by platforms like Vercel, Netlify, and Render, while providing the unique capability of full VM control across multiple cloud providers.
