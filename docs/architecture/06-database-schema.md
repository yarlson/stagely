# Stagely Database Schema

## Overview

Stagely uses PostgreSQL as its primary database. The schema is designed for:
- Hierarchical multi-tenancy (Teams → Projects → Environments)
- Tracking ephemeral infrastructure lifecycle
- Audit logging
- Encrypted secret storage
- Build pipeline state management

**Database Version:** PostgreSQL 14+

**Required Extensions:**
- `uuid-ossp` (UUID generation)
- `pgcrypto` (encryption functions - optional if using application-layer encryption)

## Schema Diagram

```
┌─────────────┐
│   teams     │
└──────┬──────┘
       │
       │ 1:N
       ↓
┌─────────────┐       ┌─────────────────┐
│  projects   │───────│ cloud_providers │
└──────┬──────┘  N:1  └─────────────────┘
       │
       │ 1:N
       ↓
┌──────────────┐       ┌─────────────┐
│ environments │───────│  secrets    │
└──────┬───────┘  N:1  └─────────────┘
       │
       │ 1:N
       ↓
┌───────────────┐
│ workflow_runs │
└──────┬────────┘
       │
       │ 1:N
       ↓
┌──────────────┐
│ build_jobs   │
└──────────────┘
```

## Core Tables

### `teams`

Top-level tenant isolation.

```sql
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,

    -- Billing
    billing_email VARCHAR(255),
    billing_plan VARCHAR(50) DEFAULT 'free',

    -- Limits
    max_concurrent_environments INT DEFAULT 5,
    max_concurrent_builds INT DEFAULT 10,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,

    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT valid_plan CHECK (billing_plan IN ('free', 'pro', 'enterprise'))
);

CREATE INDEX idx_teams_slug ON teams(slug);
CREATE INDEX idx_teams_deleted ON teams(deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE teams IS 'Top-level tenant. Users belong to teams.';
COMMENT ON COLUMN teams.slug IS 'URL-safe identifier (e.g., "acme-corp")';
COMMENT ON COLUMN teams.max_concurrent_environments IS 'Quota: max active preview environments';
```

### `users`

User accounts (authentication handled externally via OAuth or similar).

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,

    -- OAuth
    github_id VARCHAR(100) UNIQUE,
    google_id VARCHAR(100) UNIQUE,

    -- Status
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,

    CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_github ON users(github_id);
```

### `team_members`

Many-to-many relationship between users and teams.

```sql
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_team_user UNIQUE(team_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_user ON team_members(user_id);

COMMENT ON TABLE team_members IS 'User membership in teams with role-based access control';
```

**Roles:**
- `owner`: Full control, can delete team
- `admin`: Manage projects, billing, members
- `member`: Create environments, view secrets
- `viewer`: Read-only access

### `projects`

A project represents a Git repository.

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,

    -- Git
    repo_url TEXT NOT NULL,
    repo_provider VARCHAR(50) NOT NULL DEFAULT 'github',
    default_branch VARCHAR(100) DEFAULT 'main',

    -- Cloud
    cloud_provider_id UUID REFERENCES cloud_providers(id),
    default_preview_size VARCHAR(20) DEFAULT 'medium',

    -- Configuration
    config JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_project_slug UNIQUE(team_id, slug),
    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT valid_provider CHECK (repo_provider IN ('github', 'gitlab', 'bitbucket')),
    CONSTRAINT valid_size CHECK (default_preview_size IN ('small', 'medium', 'large', 'xlarge'))
);

CREATE INDEX idx_projects_team ON projects(team_id);
CREATE INDEX idx_projects_slug ON projects(team_id, slug);
CREATE INDEX idx_projects_repo ON projects(repo_url);

COMMENT ON TABLE projects IS 'Git repositories configured for preview environments';
COMMENT ON COLUMN projects.config IS 'Project-specific settings (JSON)';
```

### `cloud_providers`

User-provided cloud credentials.

```sql
CREATE TABLE cloud_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,

    -- Encrypted credentials
    encrypted_credentials TEXT NOT NULL,

    -- Configuration
    region VARCHAR(50),
    config JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_validated_at TIMESTAMPTZ,
    validation_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_provider_name UNIQUE(team_id, name),
    CONSTRAINT valid_provider CHECK (provider_type IN ('aws', 'gcp', 'digitalocean', 'hetzner', 'linode'))
);

CREATE INDEX idx_cloud_providers_team ON cloud_providers(team_id);

COMMENT ON TABLE cloud_providers IS 'User-managed cloud provider credentials (BYO Cloud model)';
COMMENT ON COLUMN cloud_providers.encrypted_credentials IS 'AES-256-GCM encrypted JSON of API keys/tokens';
```

**Example `encrypted_credentials` (after decryption):**

```json
{
  "aws": {
    "access_key_id": "AKIA...",
    "secret_access_key": "...",
    "region": "us-east-1"
  }
}
```

### `environments`

An environment is a deployed instance of a PR.

```sql
CREATE TABLE environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- GitHub/Git Context
    pr_number INT,
    branch_name VARCHAR(255) NOT NULL,
    commit_hash VARCHAR(40) NOT NULL,

    -- Routing
    subdomain_hash VARCHAR(50) NOT NULL UNIQUE,

    -- Infrastructure
    vm_id VARCHAR(255),
    vm_ip INET,
    vm_status VARCHAR(20) DEFAULT 'pending',

    -- Lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    deployed_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,

    -- Cost tracking
    estimated_cost_usd DECIMAL(10, 4) DEFAULT 0.0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_vm_status CHECK (vm_status IN ('pending', 'provisioning', 'running', 'stopped', 'terminated')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'building', 'deploying', 'ready', 'failed', 'terminated'))
);

CREATE INDEX idx_environments_project ON environments(project_id);
CREATE INDEX idx_environments_pr ON environments(project_id, pr_number);
CREATE INDEX idx_environments_hash ON environments(subdomain_hash);
CREATE INDEX idx_environments_status ON environments(status);
CREATE INDEX idx_environments_heartbeat ON environments(last_heartbeat_at) WHERE status = 'ready';

COMMENT ON TABLE environments IS 'Ephemeral preview environments (one per PR)';
COMMENT ON COLUMN environments.subdomain_hash IS 'NanoID for URL: https://{hash}.stagely.dev';
COMMENT ON COLUMN environments.last_heartbeat_at IS 'Agent heartbeat timestamp (used by Reaper)';
```

### `workflow_runs`

A workflow run represents the build → deploy → test pipeline for an environment.

```sql
CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,

    -- Trigger
    trigger VARCHAR(50) NOT NULL,
    triggered_by UUID REFERENCES users(id),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INT,

    -- Result
    result VARCHAR(20),
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_trigger CHECK (trigger IN ('pr_opened', 'pr_synchronized', 'manual_rebuild', 'secret_updated')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'building', 'deploying', 'testing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT valid_result CHECK (result IN ('success', 'failure', 'cancelled') OR result IS NULL)
);

CREATE INDEX idx_workflow_runs_env ON workflow_runs(environment_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_created ON workflow_runs(created_at DESC);

COMMENT ON TABLE workflow_runs IS 'Build/deploy/test pipeline execution tracking';
```

### `build_jobs`

A build job is a single Docker image build (part of a workflow run).

```sql
CREATE TABLE build_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,

    -- Build config
    name VARCHAR(100) NOT NULL,
    architecture VARCHAR(20) NOT NULL,
    context_path VARCHAR(500),
    dockerfile_path VARCHAR(500),

    -- Infrastructure
    vm_id VARCHAR(255),
    cloud_provider_id UUID REFERENCES cloud_providers(id),
    machine_size VARCHAR(20),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'queued',

    -- Timing
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INT,

    -- Result
    artifact_url TEXT,
    exit_code INT,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_architecture CHECK (architecture IN ('amd64', 'arm64', 'multi')),
    CONSTRAINT valid_status CHECK (status IN ('queued', 'provisioning', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_build_jobs_workflow ON build_jobs(workflow_run_id);
CREATE INDEX idx_build_jobs_status ON build_jobs(status);
CREATE INDEX idx_build_jobs_queued ON build_jobs(queued_at) WHERE status = 'queued';

COMMENT ON TABLE build_jobs IS 'Individual build tasks (one per build target per architecture)';
COMMENT ON COLUMN build_jobs.artifact_url IS 'Docker registry URL: registry.internal/proj/env:tag';
```

### `build_logs`

Streaming logs from build jobs.

```sql
CREATE TABLE build_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_job_id UUID NOT NULL REFERENCES build_jobs(id) ON DELETE CASCADE,

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stream VARCHAR(10) NOT NULL,
    line TEXT NOT NULL,

    CONSTRAINT valid_stream CHECK (stream IN ('stdout', 'stderr'))
);

CREATE INDEX idx_build_logs_job ON build_logs(build_job_id, timestamp);

COMMENT ON TABLE build_logs IS 'Real-time build output (streamed via Agent WebSocket)';
```

**Retention Policy:** Logs older than 30 days are automatically deleted (via cron job or TimescaleDB retention).

### `secrets`

Encrypted environment variables and files.

```sql
CREATE TABLE secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Secret identity
    key VARCHAR(255) NOT NULL,
    encrypted_value TEXT NOT NULL,

    -- Scoping
    scope VARCHAR(50) NOT NULL DEFAULT 'global',

    -- Type
    secret_type VARCHAR(20) NOT NULL DEFAULT 'env',
    file_path TEXT,
    file_permissions VARCHAR(4),

    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_secret_per_scope UNIQUE(project_id, key, scope),
    CONSTRAINT valid_scope CHECK (scope = 'global' OR scope ~ '^[a-zA-Z0-9_-]+$'),
    CONSTRAINT valid_type CHECK (secret_type IN ('env', 'file'))
);

CREATE INDEX idx_secrets_project ON secrets(project_id);
CREATE INDEX idx_secrets_project_scope ON secrets(project_id, scope);

COMMENT ON TABLE secrets IS 'Encrypted secrets injected into environments';
COMMENT ON COLUMN secrets.scope IS '"global" or service name (e.g., "backend", "frontend")';
COMMENT ON COLUMN secrets.encrypted_value IS 'AES-256-GCM encrypted';
```

### `audit_logs`

Audit trail for compliance.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who
    actor_id UUID REFERENCES users(id),
    actor_email VARCHAR(255),
    actor_ip INET,

    -- What
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,

    -- Context
    team_id UUID REFERENCES teams(id),
    project_id UUID REFERENCES projects(id),

    -- Details
    metadata JSONB,

    -- When
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_resource_type CHECK (resource_type IN ('team', 'project', 'environment', 'secret', 'user', 'workflow_run'))
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_team ON audit_logs(team_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

COMMENT ON TABLE audit_logs IS 'Audit trail for all sensitive operations';
```

**Example Events:**
- `secret.created`
- `secret.updated`
- `secret.deleted`
- `secret.accessed`
- `environment.deployed`
- `environment.terminated`
- `user.added_to_team`

### `agent_connections`

Track active Agent WebSocket connections.

```sql
CREATE TABLE agent_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,

    agent_id VARCHAR(100) NOT NULL UNIQUE,
    token_hash VARCHAR(64) NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'connected',

    -- Metadata
    ip_address INET,
    agent_version VARCHAR(20),
    system_info JSONB,

    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('connected', 'disconnected'))
);

CREATE INDEX idx_agent_connections_env ON agent_connections(environment_id);
CREATE INDEX idx_agent_connections_last_seen ON agent_connections(last_seen_at) WHERE status = 'connected';

COMMENT ON TABLE agent_connections IS 'Active Agent WebSocket connections (in-memory state persisted)';
```

## Views

### `active_environments`

Convenient view for querying running environments.

```sql
CREATE VIEW active_environments AS
SELECT
    e.id,
    e.subdomain_hash,
    e.status,
    e.vm_ip,
    p.name AS project_name,
    t.name AS team_name,
    CONCAT('https://', e.subdomain_hash, '.stagely.dev') AS public_url,
    e.last_heartbeat_at,
    EXTRACT(EPOCH FROM (NOW() - e.created_at)) / 3600 AS age_hours,
    e.estimated_cost_usd
FROM environments e
JOIN projects p ON e.project_id = p.id
JOIN teams t ON p.team_id = t.id
WHERE e.status IN ('deploying', 'ready')
  AND e.terminated_at IS NULL;

COMMENT ON VIEW active_environments IS 'All currently active preview environments';
```

### `stale_environments`

Environments that need cleanup (Reaper target).

```sql
CREATE VIEW stale_environments AS
SELECT
    e.id,
    e.subdomain_hash,
    e.last_heartbeat_at,
    e.created_at,
    p.name AS project_name,
    CASE
        WHEN e.last_heartbeat_at < NOW() - INTERVAL '15 minutes' THEN 'agent_dead'
        WHEN e.created_at < NOW() - INTERVAL '24 hours' THEN 'ttl_expired'
    END AS stale_reason
FROM environments e
JOIN projects p ON e.project_id = p.id
WHERE e.status = 'ready'
  AND (
    e.last_heartbeat_at < NOW() - INTERVAL '15 minutes'
    OR e.created_at < NOW() - INTERVAL '24 hours'
  );

COMMENT ON VIEW stale_environments IS 'Environments eligible for termination by Reaper';
```

## Functions

### `update_updated_at()`

Trigger function to automatically update `updated_at` timestamp.

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at column
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ... (repeat for all tables)
```

### `generate_subdomain_hash()`

Generate unique NanoID for environment URLs.

```sql
CREATE OR REPLACE FUNCTION generate_subdomain_hash()
RETURNS TEXT AS $$
DECLARE
    alphabet TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
    result TEXT := '';
    i INT;
BEGIN
    FOR i IN 1..12 LOOP
        result := result || substr(alphabet, floor(random() * length(alphabet) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Ensure uniqueness
CREATE OR REPLACE FUNCTION generate_unique_subdomain_hash()
RETURNS TEXT AS $$
DECLARE
    new_hash TEXT;
    hash_exists BOOLEAN;
BEGIN
    LOOP
        new_hash := generate_subdomain_hash();
        SELECT EXISTS(SELECT 1 FROM environments WHERE subdomain_hash = new_hash) INTO hash_exists;
        EXIT WHEN NOT hash_exists;
    END LOOP;
    RETURN new_hash;
END;
$$ LANGUAGE plpgsql;
```

## Indexes for Performance

### Composite Indexes

```sql
-- Fast lookup: "Find active environments for this project"
CREATE INDEX idx_environments_project_status ON environments(project_id, status)
WHERE status IN ('ready', 'deploying');

-- Fast lookup: "Find all build jobs waiting in queue"
CREATE INDEX idx_build_jobs_status_queued ON build_jobs(status, queued_at)
WHERE status = 'queued';

-- Fast lookup: "Find environments by PR number"
CREATE INDEX idx_environments_pr_lookup ON environments(project_id, pr_number)
WHERE terminated_at IS NULL;
```

### Partial Indexes

```sql
-- Only index non-deleted teams
CREATE INDEX idx_teams_active ON teams(id) WHERE deleted_at IS NULL;

-- Only index connected agents
CREATE INDEX idx_agents_active ON agent_connections(environment_id, last_seen_at)
WHERE status = 'connected';
```

## Partitioning (Future)

For high-volume tables, use PostgreSQL partitioning:

```sql
-- Partition build_logs by month
CREATE TABLE build_logs (
    -- ... columns ...
) PARTITION BY RANGE (timestamp);

CREATE TABLE build_logs_2025_01 PARTITION OF build_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Auto-create partitions via pg_partman extension
```

## Migrations

Use a migration tool: `golang-migrate`, `Flyway`, or `Atlas`.

**Example Migration (create_teams.sql):**

```sql
-- +migrate Up
CREATE TABLE teams (
    -- ... (table definition)
);

-- +migrate Down
DROP TABLE teams CASCADE;
```

## Backup Strategy

### Daily Backups

```bash
# Full backup
pg_dump -Fc stagely > stagely_$(date +%Y%m%d).dump

# Upload to S3
aws s3 cp stagely_$(date +%Y%m%d).dump s3://stagely-backups/
```

### Point-in-Time Recovery (PITR)

Enable WAL archiving:

```
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://stagely-wal-archive/%f'
```

### Retention

- Daily backups: 30 days
- WAL archives: 7 days

## Security

### Row-Level Security (RLS)

Ensure users can only access their teams' data:

```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_team_isolation ON projects
    USING (team_id IN (
        SELECT team_id FROM team_members WHERE user_id = current_user_id()
    ));
```

**Note:** `current_user_id()` is a custom function that returns the authenticated user's UUID (set via `SET LOCAL`).

### Connection Pooling

Use `PgBouncer` or `Supavisor` to manage connections:

```
# pgbouncer.ini
[databases]
stagely = host=postgres.internal port=5432 dbname=stagely

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```

## Monitoring

### Key Metrics

- Active environments count: `SELECT COUNT(*) FROM active_environments;`
- Pending build jobs: `SELECT COUNT(*) FROM build_jobs WHERE status = 'queued';`
- Stale environments: `SELECT COUNT(*) FROM stale_environments;`
- Database size: `SELECT pg_size_pretty(pg_database_size('stagely'));`

### Slow Queries

Enable `pg_stat_statements`:

```sql
CREATE EXTENSION pg_stat_statements;

-- Find slowest queries
SELECT
    calls,
    total_exec_time / 1000 AS total_sec,
    mean_exec_time / 1000 AS mean_sec,
    query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

## Schema Evolution

### Adding a Column

```sql
-- Safe: Add nullable column with default
ALTER TABLE environments
ADD COLUMN display_name VARCHAR(255) DEFAULT NULL;

-- Backfill (optional)
UPDATE environments SET display_name = branch_name WHERE display_name IS NULL;
```

### Removing a Column

```sql
-- Step 1: Deploy code that ignores the column
-- Step 2: Remove column (safe after deployment)
ALTER TABLE environments DROP COLUMN old_column;
```

## Testing

### Seed Data

```sql
-- Create test team
INSERT INTO teams (slug, name) VALUES ('test-team', 'Test Team');

-- Create test user
INSERT INTO users (email, name) VALUES ('test@example.com', 'Test User');

-- Add user to team
INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, u.id, 'admin'
FROM teams t, users u
WHERE t.slug = 'test-team' AND u.email = 'test@example.com';
```

### Cleanup

```sql
-- Delete all test data
DELETE FROM teams WHERE slug LIKE 'test-%';
```

## Documentation

For each table, document:
- Purpose
- Relationships
- Indexes
- Constraints

Use PostgreSQL `COMMENT`:

```sql
COMMENT ON TABLE environments IS 'Ephemeral preview environments';
COMMENT ON COLUMN environments.subdomain_hash IS 'NanoID for URL routing';
```

This documentation is queryable:

```sql
SELECT
    table_name,
    column_name,
    data_type,
    description
FROM information_schema.columns c
JOIN pg_catalog.pg_description d ON d.objoid = (c.table_schema || '.' || c.table_name)::regclass
WHERE table_schema = 'public';
```

## Future Enhancements

1. **TimescaleDB**: Convert `build_logs` to hypertable for time-series optimization
2. **Full-Text Search**: Add `tsvector` column to `build_logs` for log searching
3. **Soft Deletes**: Add `deleted_at` to all tables instead of hard deletes
4. **Multi-Region**: Shard by `team_id` for geo-distribution
