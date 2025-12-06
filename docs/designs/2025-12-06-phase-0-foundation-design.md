# Phase 0: Foundation Design

**Status:** Ready for Implementation
**Phase:** 0 - Project Foundation and Database Setup
**Created:** 2025-12-06

## 1. Overview

### Problem Statement

Stagely Core needs a solid foundation before implementing any features. Without proper project structure, configuration management, database schema, and basic utilities, subsequent development would lack consistency and proper data persistence. This phase establishes:

- Go project structure following standard layout conventions
- Type-safe configuration management
- Robust database connectivity with connection pooling
- Complete schema with proper relationships and indexes
- Encryption utilities for secrets management
- Development environment tooling

### Goals

1. **Project Structure**: Establish Go standard project layout with clear separation between cmd, internal, and pkg
2. **Configuration**: Type-safe config loading from environment variables using Viper
3. **Database**: PostgreSQL connection with GORM, migrations system, all 14 tables
4. **Models**: GORM models for all entities with proper relationships and validations
5. **Utilities**: NanoID generation for subdomain hashes, AES-256-GCM encryption for secrets
6. **Development Environment**: Docker Compose for local PostgreSQL and Redis
7. **Testing**: Database connection tests, model CRUD tests, utility tests

### Non-Goals

- HTTP API implementation (Phase 2)
- WebSocket hub (Phase 3)
- Cloud provider implementations (Phase 1)
- Frontend dashboard (separate track)
- Authentication/authorization (Phase 2)

### Success Criteria

- ✅ Go module initialized with all dependencies
- ✅ Project directories created following standard layout
- ✅ Configuration loads from environment variables
- ✅ PostgreSQL connection established with pooling
- ✅ All 14 migrations run successfully
- ✅ All GORM models compile and have proper relationships
- ✅ Database indexes created
- ✅ NanoID generation works (12-char alphanumeric)
- ✅ AES-256-GCM encryption/decryption round-trip successful
- ✅ All unit tests pass
- ✅ All integration tests pass (using testcontainers)
- ✅ README documents local setup

## 2. Architecture

### High-Level Design

Phase 0 establishes three foundational layers:

**Layer 1: Project Structure**

- Standard Go project layout with `cmd/`, `internal/`, `pkg/` directories
- Single `go.mod` at root for monorepo structure
- Clear separation between executable entry points (cmd), private application code (internal), and public libraries (pkg)

**Layer 2: Configuration & Infrastructure**

- Viper-based configuration management loading from environment variables
- Database connection factory with connection pooling (max 25 connections)
- Migration system using golang-migrate with numbered SQL files
- Docker Compose for local PostgreSQL 14 and Redis 7

**Layer 3: Data Layer**

- 14 PostgreSQL tables with proper foreign keys and constraints
- GORM models matching database schema
- Encryption utilities for sensitive data (cloud credentials, secrets)
- NanoID generator for subdomain hashes

### Key Components

1. **cmd/core/main.go**: Entry point for Core API service
   - Loads configuration
   - Establishes database connection
   - Will start HTTP server (Phase 2)

2. **internal/config/config.go**: Configuration management
   - Viper-based loading from environment
   - Struct-based config with validation
   - Defaults for development

3. **internal/db/db.go**: Database connection factory
   - PostgreSQL connection via GORM
   - Connection pooling configuration
   - Health check function

4. **internal/models/**: GORM model definitions
   - One file per primary entity
   - Embedded common fields (ID, timestamps)
   - Proper GORM tags and validations

5. **pkg/nanoid/nanoid.go**: Subdomain hash generation
   - 12-character alphanumeric strings
   - URL-safe, collision-resistant
   - Uses crypto/rand for entropy

6. **internal/crypto/encrypt.go**: AES-256-GCM encryption
   - Encrypt/Decrypt functions
   - Key derivation from 32-byte hex key
   - Tamper detection via AEAD

7. **migrations/**: SQL migration files
   - Numbered files: 001_create_teams.sql, 002_create_users.sql, etc.
   - Up and down migrations
   - Idempotent (can run multiple times safely)

### Data Flow

```
Environment Variables
        ↓
    Viper Config
        ↓
   Database URL
        ↓
    GORM Connection
        ↓
   Run Migrations
        ↓
  Models Ready for Use
```

### Technology Choices

| Component  | Technology                 | Rationale                                                                 |
| ---------- | -------------------------- | ------------------------------------------------------------------------- |
| Language   | Go 1.22+                   | Static typing, excellent concurrency, mature cloud SDKs, fast compilation |
| ORM        | GORM v1.25+                | Most popular Go ORM, good migration support, relationship handling        |
| Database   | PostgreSQL 14+             | ACID compliance, JSONB support, excellent performance, mature ecosystem   |
| Config     | Viper                      | Industry standard, supports env vars, YAML, JSON, validation              |
| Migrations | golang-migrate             | Standalone tool, supports PostgreSQL, up/down migrations, version control |
| Encryption | crypto/aes + crypto/cipher | Go standard library, AEAD mode for tamper detection                       |
| NanoID     | matoous/go-nanoid          | Small, fast, URL-safe IDs                                                 |
| Testing    | testify + testcontainers   | Assertions library + real PostgreSQL for integration tests                |

## 3. Design Decisions

### Decision 1: Migrations-First Approach

**Options Considered:**

1. Manual SQL migrations with golang-migrate
2. GORM AutoMigrate only
3. Atlas or Goose for model-to-migration generation

**Decision:** Manual SQL migrations (Option 1)

**Rationale:**

- Explicit schema control required for production systems
- Migration files are reviewable in pull requests
- Database indexes and constraints require SQL anyway
- Industry best practice for database schema management
- GORM models kept in sync via integration tests

**Trade-offs Accepted:**

- Slight duplication between SQL and GORM tags
- More upfront work to write migrations
- Gain: Full control, auditability, production-ready from day 1

### Decision 2: Single go.mod Monorepo

**Options Considered:**

1. Single go.mod at root (monorepo)
2. Separate go.mod for core, proxy, agent (multi-repo)

**Decision:** Single go.mod monorepo (Option 1)

**Rationale:**

- Core, Proxy, and Agent share many packages (models, config, crypto)
- Easier dependency management (single go.mod)
- Simpler CI/CD pipeline
- Can split later if needed (YAGNI)

**Trade-offs Accepted:**

- Larger binary size (includes unused code)
- Gain: Simpler development workflow, shared code reuse

### Decision 3: Environment Variables for Config

**Options Considered:**

1. Environment variables only
2. Config file (YAML/JSON) with env var overrides
3. Consul/Vault for config management

**Decision:** Environment variables only (Option 1) with Viper for structure

**Rationale:**

- 12-factor app methodology
- Cloud-native deployment model (Kubernetes ConfigMaps/Secrets)
- No secret files in repository
- Viper provides structure on top of env vars

**Trade-offs Accepted:**

- No default config file for reference
- Gain: Simpler deployment, no secret leaks, cloud-native

### Decision 4: AES-256-GCM for Encryption

**Options Considered:**

1. AES-256-GCM (AEAD mode)
2. AWS KMS
3. HashiCorp Vault

**Decision:** AES-256-GCM (Option 1)

**Rationale:**

- Phase 0 needs working encryption immediately
- Go standard library implementation (no external deps)
- AEAD provides both confidentiality and integrity
- Can migrate to KMS/Vault later (YAGNI)

**Trade-offs Accepted:**

- Key management responsibility on user
- No automatic key rotation
- Gain: Simple, fast, no external dependencies

### Decision 5: Testcontainers for Integration Tests

**Options Considered:**

1. In-memory SQLite for tests
2. Shared PostgreSQL instance
3. Testcontainers (Docker-based PostgreSQL)

**Decision:** Testcontainers (Option 3)

**Rationale:**

- Tests run against real PostgreSQL (not SQLite quirks)
- Isolated test environment per test suite
- CI/CD compatible (GitHub Actions has Docker)
- Industry best practice for integration testing

**Trade-offs Accepted:**

- Slower test execution (containers startup time)
- Requires Docker on developer machine
- Gain: Production-parity testing, no shared state pollution

## 4. Component Details

### 4.1 Project Structure

```
stagely/
├── cmd/
│   └── core/
│       └── main.go                 # Core API entry point
├── internal/
│   ├── config/
│   │   └── config.go              # Viper configuration
│   ├── db/
│   │   └── db.go                  # Database connection factory
│   ├── models/
│   │   ├── team.go                # Team model
│   │   ├── user.go                # User model
│   │   ├── team_member.go         # Team membership
│   │   ├── project.go             # Project model
│   │   ├── cloud_provider.go      # Cloud credentials
│   │   ├── environment.go         # Stagelet/Environment model
│   │   ├── workflow_run.go        # Build pipeline tracking
│   │   ├── build_job.go           # Build job
│   │   ├── build_log.go           # Build logs
│   │   ├── secret.go              # Encrypted secrets
│   │   ├── audit_log.go           # Audit trail
│   │   └── agent_connection.go    # Agent WebSocket state
│   └── crypto/
│       └── encrypt.go             # AES-256-GCM encryption
├── pkg/
│   └── nanoid/
│       └── nanoid.go              # Subdomain hash generation
├── migrations/
│   ├── 001_create_teams.sql
│   ├── 002_create_users.sql
│   ├── 003_create_team_members.sql
│   ├── 004_create_projects.sql
│   ├── 005_create_cloud_providers.sql
│   ├── 006_create_environments.sql
│   ├── 007_create_workflow_runs.sql
│   ├── 008_create_build_jobs.sql
│   ├── 009_create_build_logs.sql
│   ├── 010_create_secrets.sql
│   ├── 011_create_audit_logs.sql
│   ├── 012_create_agent_connections.sql
│   ├── 013_create_indexes.sql
│   └── 014_create_functions.sql
├── docker-compose.yml             # Local dev environment
├── Makefile                       # Build automation
├── go.mod
├── go.sum
└── README.md
```

### 4.2 Configuration Module

**File:** `internal/config/config.go`

**Responsibilities:**

- Load configuration from environment variables
- Provide type-safe config struct
- Set sensible defaults for development
- Validate required fields

**Interface:**

```go
type Config struct {
    Database DatabaseConfig
    Redis    RedisConfig
    Server   ServerConfig
    Security SecurityConfig
}

func Load() (*Config, error)
func (c *Config) Validate() error
```

**Environment Variables:**

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `PORT`: HTTP server port (default: 8080)
- `ENVIRONMENT`: dev/staging/production
- `LOG_LEVEL`: debug/info/warn/error
- `JWT_SECRET`: JWT signing key (Phase 2)
- `ENCRYPTION_KEY`: 32-byte hex-encoded AES key

### 4.3 Database Connection

**File:** `internal/db/db.go`

**Responsibilities:**

- Establish PostgreSQL connection via GORM
- Configure connection pooling
- Provide health check function
- Handle connection errors gracefully

**Interface:**

```go
func Connect(cfg DatabaseConfig) (*gorm.DB, error)
func HealthCheck(db *gorm.DB) error
```

**Connection Pool Settings:**

- Max open connections: 25
- Max idle connections: 5
- Connection max lifetime: 5 minutes
- Connection max idle time: 10 minutes

### 4.4 GORM Models

Each model includes:

- UUID primary key (`id`)
- Timestamps (`created_at`, `updated_at`)
- Soft delete support where applicable (`deleted_at`)
- GORM tags for column names and constraints
- JSON tags for API serialization
- Relationships (BelongsTo, HasMany, etc.)

**Common Patterns:**

```go
type BaseModel struct {
    ID        uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
    CreatedAt time.Time      `gorm:"not null;default:now()" json:"created_at"`
    UpdatedAt time.Time      `gorm:"not null;default:now()" json:"updated_at"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}
```

**Key Models:**

1. **Team**: Top-level tenant
2. **User**: User account
3. **TeamMember**: User-Team many-to-many
4. **Project**: Git repository configuration
5. **CloudProvider**: Encrypted cloud credentials
6. **Environment**: Preview environment (stagelet)
7. **WorkflowRun**: Build pipeline execution
8. **BuildJob**: Individual build task
9. **BuildLog**: Streaming build output
10. **Secret**: Encrypted environment variables/files
11. **AuditLog**: Compliance audit trail
12. **AgentConnection**: Active WebSocket connections

### 4.5 Encryption Module

**File:** `internal/crypto/encrypt.go`

**Responsibilities:**

- Encrypt sensitive data (cloud credentials, secrets)
- Decrypt data for use
- Detect tampering via AEAD

**Interface:**

```go
func Encrypt(plaintext string, key []byte) (string, error)
func Decrypt(ciphertext string, key []byte) (string, error)
func GenerateKey() ([]byte, error)
```

**Algorithm:** AES-256-GCM

- Key size: 32 bytes (256 bits)
- Nonce: 12 bytes (96 bits), randomly generated per encryption
- Output format: base64(nonce + ciphertext + tag)

**Security Properties:**

- Confidentiality: AES-256 encryption
- Integrity: GCM authentication tag
- Tamper detection: AEAD mode

### 4.6 NanoID Module

**File:** `pkg/nanoid/nanoid.go`

**Responsibilities:**

- Generate URL-safe unique identifiers
- Used for subdomain hashes (e.g., `pr-123-a8f9d2k1p4m7.stagely.dev`)

**Interface:**

```go
func Generate() string
func GenerateWithLength(length int) string
```

**Characteristics:**

- Alphabet: `abcdefghijklmnopqrstuvwxyz0123456789` (36 chars)
- Default length: 12 characters
- Collision probability: ~1 in 10^21 for 1 million IDs
- Uses crypto/rand for entropy

### 4.7 Database Migrations

**Tool:** golang-migrate

**Migration Files:** Numbered SQL files in `migrations/` directory

**Naming Convention:**

- `001_create_teams.sql`
- `002_create_users.sql`
- etc.

**Structure:**

```sql
-- +migrate Up
CREATE TABLE teams (...);

-- +migrate Down
DROP TABLE teams;
```

**Migration Order:**

1. Core entities (teams, users)
2. Relationships (team_members)
3. Projects and cloud providers
4. Environments and workflows
5. Build jobs and logs
6. Secrets and audit logs
7. Agent connections
8. Indexes
9. Functions and triggers

**Idempotency:** All migrations use `IF NOT EXISTS` where possible

## 5. Error Handling

### Database Connection Errors

**Scenario:** PostgreSQL is unreachable or credentials are invalid

**Recovery Strategy:**

- Log error with full context (connection string without password)
- Retry 3 times with exponential backoff (1s, 2s, 4s)
- If all retries fail, exit with non-zero code
- Health check endpoint returns 503 Service Unavailable

**User-Facing Error:**

```
Failed to connect to database after 3 attempts. Please check DATABASE_URL configuration.
```

### Migration Errors

**Scenario:** Migration fails midway through execution

**Recovery Strategy:**

- golang-migrate tracks migration version in `schema_migrations` table
- Failed migrations do NOT increment version
- User must fix SQL and re-run `migrate up`
- Provide clear error message with SQL line number

**User-Facing Error:**

```
Migration 006_create_environments.sql failed at line 42:
  ERROR: column "vm_status" does not exist
```

### Configuration Errors

**Scenario:** Required environment variable is missing

**Recovery Strategy:**

- Validate all required config on startup
- Fail fast with clear error message
- List all missing variables

**User-Facing Error:**

```
Configuration error: Missing required environment variables:
  - DATABASE_URL
  - ENCRYPTION_KEY
```

### Encryption Errors

**Scenario:** Decrypt fails due to wrong key or tampered data

**Recovery Strategy:**

- Return error, do not panic
- Log error without exposing plaintext or key
- For tampered data: "integrity check failed"
- For wrong key: "decryption failed"

**User-Facing Error:**

```
Failed to decrypt secret: integrity check failed (data may be corrupted or tampered)
```

## 6. Testing Strategy

### Unit Tests

**Location:** `*_test.go` files alongside source

**Coverage Target:** 80% for utilities (crypto, nanoid), 60% for models

**Test Cases:**

1. **NanoID Generation:**
   - Default length is 12 characters
   - Only contains alphanumeric characters
   - Generates unique values (test 1000 iterations)

2. **Encryption:**
   - Round-trip: Encrypt → Decrypt returns original plaintext
   - Wrong key: Decrypt with different key fails
   - Tampered data: Modify ciphertext, decrypt fails
   - Empty string: Encrypts and decrypts correctly

3. **Configuration:**
   - Loads from environment variables
   - Uses defaults when env vars missing
   - Validates required fields

4. **Models:**
   - GORM tags correct (column names match schema)
   - JSON serialization works
   - Relationships defined correctly

### Integration Tests

**Location:** `internal/db/db_test.go`, `internal/models/*_test.go`

**Tool:** testcontainers-go

**Test Cases:**

1. **Database Connection:**
   - Connect to PostgreSQL testcontainer
   - Execute simple query (SELECT 1)
   - Connection pool works

2. **Migrations:**
   - Run all migrations up
   - Verify tables exist
   - Run migrations down
   - Verify tables dropped
   - Idempotency: Run up twice, no errors

3. **GORM CRUD:**
   - Create team → verify in database
   - Read team → verify fields match
   - Update team → verify changes persisted
   - Delete team (soft delete) → verify deleted_at set

4. **Relationships:**
   - Create team + user → add team_member → verify join
   - Create project with cloud_provider → verify foreign key
   - Create environment with workflow_run → verify cascade

5. **Unique Constraints:**
   - Create duplicate team slug → expect error
   - Create duplicate user email → expect error

6. **Indexes:**
   - Query by indexed column → verify EXPLAIN shows index scan
   - Query by non-indexed column → verify seq scan (for comparison)

### Edge Cases

1. **NanoID:**
   - Length 0 → returns empty string or error
   - Length 1000 → works correctly
   - Concurrent generation → no duplicates

2. **Encryption:**
   - Very long plaintext (1 MB) → encrypts successfully
   - Special characters in plaintext → round-trip works
   - Empty key → returns error

3. **Database:**
   - Connection pool exhausted → blocks until connection available
   - Long-running transaction → times out after configured duration
   - Duplicate key insertion → returns specific error

4. **Configuration:**
   - Invalid DATABASE_URL format → fails validation
   - PORT outside valid range (1-65535) → fails validation

## 7. Implementation Considerations

### Potential Challenges

1. **Migration Ordering:**
   - Challenge: Foreign key dependencies require specific table creation order
   - Solution: Number migrations carefully, test rollback order

2. **GORM Tag Synchronization:**
   - Challenge: Keeping GORM tags in sync with SQL migrations
   - Solution: Integration tests verify GORM can read/write to actual schema

3. **Encryption Key Management:**
   - Challenge: Users need to generate and store 32-byte keys securely
   - Solution: Provide `GenerateKey()` utility, document key rotation process

4. **Connection Pool Tuning:**
   - Challenge: Optimal pool size depends on workload
   - Solution: Start with conservative defaults (25 max), document tuning guide

### Areas Needing Special Attention

1. **Database Indexes:**
   - Must match query patterns from later phases
   - Review database schema doc for performance-critical queries
   - Add composite indexes for common filters (e.g., project_id + status)

2. **GORM Relationships:**
   - Preload vs Joins performance implications
   - Avoid N+1 queries in GORM usage
   - Test cascade delete behavior

3. **Migration Reversibility:**
   - All migrations must have working `Down` migrations
   - Data loss in Down is acceptable (dev only), but schema must reverse cleanly

4. **Testcontainer Cleanup:**
   - Ensure containers are stopped after tests (defer cleanup)
   - Tests should be runnable in parallel (unique database names)

### Dependencies on Other Systems

**None** - Phase 0 is foundational and has no external service dependencies beyond:

- PostgreSQL database (provided via Docker Compose)
- Redis (for Phase 2+, included in Docker Compose)

## 8. Future Enhancements

### Features Intentionally Deferred

1. **Database Connection Pooling via PgBouncer:**
   - Reason: GORM built-in pooling sufficient for Phase 0
   - Future: Add PgBouncer for 1000+ connection scalability

2. **Migration Versioning in Go:**
   - Reason: golang-migrate CLI is sufficient
   - Future: Embed migrations in binary using embed.FS

3. **Configuration Hot Reload:**
   - Reason: 12-factor apps are immutable (restart to change config)
   - Future: Add SIGHUP signal handler for graceful reload

4. **Multi-Region Database:**
   - Reason: Single-region sufficient for MVP
   - Future: Add read replicas, geo-sharding by team_id

5. **Advanced Encryption (KMS/Vault):**
   - Reason: AES-256-GCM sufficient for MVP
   - Future: Integrate AWS KMS or HashiCorp Vault for key management

6. **Database Partitioning:**
   - Reason: Not needed at low scale
   - Future: Partition build_logs by timestamp (monthly partitions)

7. **Full-Text Search:**
   - Reason: No search requirements in Phase 0
   - Future: Add tsvector column to build_logs for log search

### Extension Points

1. **Configuration Sources:**
   - Current: Environment variables only
   - Future: Add Viper support for YAML files, Consul, etcd

2. **Encryption Algorithms:**
   - Current: AES-256-GCM hardcoded
   - Future: Interface-based design allowing ChaCha20-Poly1305, etc.

3. **Database Drivers:**
   - Current: PostgreSQL only
   - Future: Abstract database layer to support MySQL, CockroachDB

4. **Migration Tools:**
   - Current: golang-migrate
   - Future: Support Atlas for schema diffing

### Migration Considerations

**From Phase 0 to Phase 1:**

- No schema changes required
- Cloud provider interface will use `cloud_providers` table

**From Phase 0 to Phase 2:**

- Add API token fields to users table
- Add webhook secret to projects table

## 9. Acceptance Criteria

### Must Have (Blocking)

- [ ] Go module initialized with go.mod
- [ ] All directories created (cmd, internal, pkg, migrations)
- [ ] Configuration loads DATABASE_URL from env
- [ ] Database connection successful
- [ ] All 14 migrations run without errors
- [ ] All GORM models compile
- [ ] Teams CRUD operations work (Create, Read, Update, Delete)
- [ ] NanoID generates 12-character strings
- [ ] Encryption round-trip successful
- [ ] Docker Compose starts PostgreSQL
- [ ] Makefile has build, test, migrate-up, migrate-down targets
- [ ] All tests pass

### Should Have (Important)

- [ ] README documents local setup
- [ ] Integration tests use testcontainers
- [ ] All models have proper relationships
- [ ] Database indexes created for performance queries
- [ ] Encryption detects tampered data
- [ ] Configuration validates required fields

### Nice to Have (Optional)

- [ ] Code coverage >70%
- [ ] Golangci-lint passes
- [ ] Git pre-commit hook for tests
- [ ] Migration rollback tested

## 10. Definition of Done

Phase 0 is complete when:

1. ✅ All migrations run successfully (`make migrate-up`)
2. ✅ All tests pass (`make test`)
3. ✅ Linter passes (`make lint`)
4. ✅ Developer can run `docker-compose up` and connect to database
5. ✅ README has clear setup instructions
6. ✅ Integration test creates team, verifies in database
7. ✅ Encryption utility encrypts/decrypts a secret
8. ✅ NanoID generates unique subdomain hashes
9. ✅ Code committed to main branch
10. ✅ Ready to start Phase 1 (Cloud Provider Interface)

## 11. Timeline Estimate

Based on roadmap: **16 hours**

**Breakdown:**

- Project setup (go.mod, directories, Makefile): 2 hours
- Configuration module with Viper: 1 hour
- Database connection and health check: 1 hour
- Write 14 SQL migrations: 4 hours
- Define 12 GORM models: 3 hours
- Encryption utilities: 1 hour
- NanoID utility: 0.5 hours
- Docker Compose setup: 0.5 hours
- Unit tests: 2 hours
- Integration tests with testcontainers: 2 hours
- README documentation: 1 hour
- Buffer for debugging: 1 hour

## 12. Related Documents

- [Database Schema](../architecture/06-database-schema.md) - Complete schema specification
- [Implementation Stack](../architecture/09-implementation-stack.md) - Technology choices
- [Roadmap Phase 0](../roadmaps/2025-12-06-stagely-core-roadmap.md) - Phase requirements

## 13. Open Questions

None - Phase 0 requirements are well-defined.

## 14. Approvals

- [x] Design reviewed for SOLID principles
- [x] Design reviewed for YAGNI compliance
- [x] Design reviewed for testability
- [x] Design reviewed for maintainability
- [x] Design reviewed against roadmap requirements

**Ready for Planning Phase** ✅
