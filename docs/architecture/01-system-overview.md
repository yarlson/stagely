# Stagely System Architecture Overview

## Executive Summary

Stagely is a self-hosted ephemeral environment platform that creates production-like testing environments based on GitHub Pull Requests. It provisions VMs across multiple cloud providers, acts as a CI/CD job runner, and provides a centralized dashboard for managing preview environments.

## Core Value Proposition

- **Full VM Control**: Unlike container-only platforms (Vercel, Netlify), Stagely provides root access and kernel-level control
- **Multi-Cloud**: Pluggable architecture supports AWS, DigitalOcean, Hetzner, and other providers
- **BYO Cloud**: Users provide their own cloud credentials, reducing platform operational costs
- **Docker-Native**: Uses standard `docker-compose.yml` - no proprietary configuration format
- **Ephemeral by Design**: Environments are automatically reaped when PRs close or TTL expires

## Architecture Philosophy

### Split Plane Design

The system is divided into two independent planes:

1. **Control Plane** (Private Network)
   - Stagely Core API
   - PostgreSQL Database
   - Internal Docker Registry
   - Protected by VPN/Private Subnet

2. **Data Plane** (Public Network)
   - Edge Proxy (handles *.stagely.dev traffic)
   - User's VMs (running in their cloud accounts)
   - Read-only access to Redis routing table

### Security Model

- **Zero Trust**: Agents connect outbound via WebSocket; no inbound SSH required
- **Encrypted Secrets**: AES-256-GCM at rest, TLS 1.3 in transit
- **Auto-Registration**: Agents receive identity via Cloud-Init during VM provisioning
- **Credential Isolation**: User cloud credentials stored per-project, never shared

## High-Level Data Flow

```
┌─────────────────┐
│  GitHub PR      │
│  Event          │
└────────┬────────┘
         │
         v
┌─────────────────────────────────────────┐
│  Stagely Core (Control Plane)           │
│  ┌─────────────────────────────────┐    │
│  │ 1. Parse stagely.yaml           │    │
│  │ 2. Generate build matrix        │    │
│  │ 3. Provision Builder VMs        │    │
│  └─────────────────────────────────┘    │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        v                   v
┌───────────────┐   ┌───────────────┐
│ Builder VM    │   │ Builder VM    │
│ (AMD64)       │   │ (ARM64)       │
│               │   │               │
│ docker build  │   │ docker build  │
│ docker push   │   │ docker push   │
└───────┬───────┘   └───────┬───────┘
        │                   │
        └─────────┬─────────┘
                  │
                  v
        ┌──────────────────┐
        │ Internal Docker  │
        │ Registry         │
        └─────────┬────────┘
                  │
                  v
        ┌──────────────────────────┐
        │ Preview VM (User Cloud)  │
        │ ┌──────────────────────┐ │
        │ │ Agent pulls image    │ │
        │ │ Generates override   │ │
        │ │ docker compose up    │ │
        │ │ Reports health       │ │
        │ └──────────────────────┘ │
        └─────────┬────────────────┘
                  │
                  v
        ┌──────────────────┐
        │ Redis Update     │
        │ route:abc123 ->  │
        │ 54.1.2.3:3000    │
        └─────────┬────────┘
                  │
                  v
        ┌──────────────────────────┐
        │ Edge Proxy               │
        │ (Public: *.stagely.dev)  │
        │                          │
        │ https://abc123.stagely.  │
        │ dev -> 54.1.2.3:3000     │
        └──────────────────────────┘
```

## Component Breakdown

### 1. Stagely Core (Go Backend)

**Responsibilities:**
- Accept GitHub webhooks (PR open/close/push)
- Parse `stagely.yaml` configuration
- Orchestrate build pipelines (fan-out/fan-in)
- Manage WebSocket connections from Agents
- Store encrypted secrets
- Provision VMs via Cloud Provider APIs
- Track resource lifecycle

**Technology Stack:**
- Language: Go
- Framework: Gin or Chi (HTTP router)
- WebSocket: gorilla/websocket
- Database ORM: sqlc or gorm
- Secrets Encryption: AES-256-GCM (crypto/aes)

**Network Position:**
- Listens on private interface only
- Exposed via Control Gateway (Nginx/Caddy ingress)
- Only specific endpoints exposed:
  - `/v1/webhooks/github` (public, HMAC-verified)
  - `/v1/agent/connect` (public, agent WebSocket endpoint)
  - `/v1/api/*` (authenticated dashboard requests)

### 2. Edge Proxy (Go/Caddy)

**Responsibilities:**
- Terminate TLS for `*.stagely.dev`
- Query Redis for routing table
- Reverse proxy to user's VM IP
- Inject context headers (X-Stagely-PR, X-Stagely-Project, X-Stagely-Team)
- Serve "Building..." static page when environment is not ready

**Technology Stack:**
- Language: Go
- Library: net/http/httputil (ReverseProxy)
- TLS: caddyserver/certmagic (automatic wildcard cert management)
- State: Redis (read-only)

**Certificate Strategy:**
- Single wildcard certificate: `*.stagely.dev`
- Generated once via DNS-01 challenge (manual setup)
- Cached in memory
- No per-environment certificate generation (avoids Let's Encrypt rate limits)

**Routing Logic:**
```go
// Pseudo-code
host := "abc123.stagely.dev"
hash := strings.Split(host, ".")[0] // "abc123"

target := redis.Get("route:" + hash)
if target == nil {
    return "404: Environment not found"
}

if target.Status == "building" {
    return staticHTML("Building your environment...")
}

proxy := httputil.NewSingleHostReverseProxy(target.IP + ":" + target.Port)
proxy.ServeHTTP(w, r)
```

### 3. Stagely Agent (Go Binary)

**Responsibilities:**
- Auto-register with Stagely Core using injected token
- Maintain persistent WebSocket connection
- Execute deployment commands
- Generate `docker-compose.stagely.yml` override file
- Stream logs to Core in real-time
- Report container health status
- Auto-terminate VM if disconnected >15 minutes

**Technology Stack:**
- Language: Go (single static binary)
- Container Runtime: Docker Engine (via unix socket)
- Process Management: systemd
- Log Streaming: io.TeeReader to WebSocket

**Deployment:**
- Installed via Cloud-Init script during VM provisioning
- Runs as systemd service (auto-restart on crash)
- Configuration: `/etc/stagely/config.json` (agent_id, token)

**WebSocket Protocol:**
```json
// Agent -> Core (Handshake)
{
  "type": "HELLO",
  "agent_id": "srv_892304820",
  "token": "sk_live_9s8d7f6g5h4j3k2l",
  "ip": "54.1.2.3"
}

// Core -> Agent (Deploy Command)
{
  "type": "DEPLOY",
  "payload": {
    "image": "registry.internal/project/pr-10:latest",
    "secrets": [
      {"key": "DATABASE_URL", "value": "...", "scope": "global"},
      {"key": "PORT", "value": "8080", "scope": "backend"}
    ]
  }
}

// Agent -> Core (Log Stream)
{
  "type": "LOG",
  "stream": "stdout",
  "data": "Container backend created\n"
}

// Agent -> Core (Health Report)
{
  "type": "STATUS",
  "state": "healthy",
  "services": [
    {"name": "backend", "status": "running", "port": 8080},
    {"name": "frontend", "status": "running", "port": 3000}
  ]
}
```

### 4. Internal Docker Registry

**Responsibilities:**
- Store built Docker images
- Provide layer caching for fast rebuilds
- Serve images to Preview VMs

**Technology Stack:**
- Software: distribution/distribution (official Docker Registry v2)
- Storage: S3-compatible backend (Minio or cloud provider)
- Network: Private subnet only (no public access)

**Security:**
- Authentication: Token-based (generated by Stagely Core)
- HTTPS only
- Images are namespaced by project: `registry.internal/{project_id}/{environment_id}:{tag}`

### 5. PostgreSQL Database

**Schema Overview:**
```
teams (id, slug, name)
  └─> projects (id, team_id, slug, repo_url, cloud_provider_config)
       └─> environments (id, project_id, pr_number, subdomain_hash, vm_ip, status)
            ├─> workflow_runs (id, environment_id, status, created_at)
            │    └─> build_jobs (id, workflow_run_id, name, status, artifact_url, vm_id, arch)
            └─> secrets (id, project_id, key, encrypted_value, scope, created_at)
```

**Encryption:**
- Secrets are encrypted at the application layer before insert
- Encryption key stored in environment variable (or KMS)

### 6. Redis (Routing Table)

**Purpose:**
- Fast lookup for Edge Proxy routing decisions
- TTL-based expiration (auto-cleanup on VM death)

**Data Structure:**
```
Key: route:{subdomain_hash}
Value: JSON { "ip": "54.1.2.3", "port": 3000, "status": "ready", "project": "api-svc" }
TTL: 1 hour (refreshed by Agent heartbeat every 30s)
```

## URL Structure

**Format:** `https://<hash>.stagely.dev`

**Example:** `https://br7x-9jq2.stagely.dev`

**Hash Generation:**
- Algorithm: NanoID (21 characters, URL-safe)
- Collision probability: negligible (1% at 82M IDs)
- Stored in `environments.subdomain_hash` column

**Why Flat URLs:**
- Single wildcard certificate works for all environments
- No rate limit issues with Let's Encrypt
- Privacy: Can't guess PR URLs
- Simplicity: No DNS updates required

## Hierarchy Model

Despite flat URLs, the system maintains strict hierarchical permissions:

```
Team (backend-team)
  └─> Project (api-svc)
       └─> Environment (PR #10)
            └─> URL: https://abc123.stagely.dev
```

Users must have access to the Team to view Projects within it.

## Network Topology

### Trusted Zone (Your Infrastructure)

```
┌────────────────────────────────────────────┐
│  Private Subnet (10.0.1.0/24)              │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ Stagely Core │  │ PostgreSQL   │        │
│  │              │  │              │        │
│  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐        │
│  │ Redis        │  │ Docker Reg   │        │
│  │              │  │              │        │
│  └──────────────┘  └──────────────┘        │
└────────────────────────────────────────────┘
         │
         │ (Ingress: Only /webhooks and /agent/connect exposed)
         │
┌────────┴───────────────────────────────────┐
│  Control Gateway (Nginx/Caddy)             │
│  - /v1/webhooks/github → Core              │
│  - /v1/agent/connect → Core (WS)           │
│  - /v1/api/* → Core (Authenticated)        │
└────────────────────────────────────────────┘
```

### Public Zone

```
┌────────────────────────────────────────────┐
│  Edge Proxy (Public: *.stagely.dev)        │
│  ┌──────────────────────────────────┐      │
│  │ TLS Termination (Wildcard Cert)  │      │
│  │ Redis Lookup                     │      │
│  │ Reverse Proxy to VM              │      │
│  └──────────────────────────────────┘      │
└────────────────────────────────────────────┘
         │
         │ (Routes to User's VMs)
         │
┌────────┴───────────────────────────────────┐
│  Wild Zone (User's Cloud Accounts)         │
│  ┌─────────────────────────────────┐       │
│  │ VM (AWS/DO/Hetzner)             │       │
│  │ ┌─────────────────────────────┐ │       │
│  │ │ Stagely Agent (Outbound WS) │ │       │
│  │ │ Docker Engine               │ │       │
│  │ │ App Containers              │ │       │
│  │ └─────────────────────────────┘ │       │
│  └─────────────────────────────────┘       │
└────────────────────────────────────────────┘
```

## Deployment Lifecycle

### 1. PR Opened Event

```
GitHub → Stagely Core webhook
  → Core parses stagely.yaml
  → Core generates workflow_run record (status: pending)
  → Core fans out: Create build_jobs for each build target
  → Core calls Cloud Provider APIs to provision Builder VMs
  → Core injects Cloud-Init script with:
      - Agent binary URL
      - Enrollment token (JWT)
      - Job ID
```

### 2. Build Phase (Parallel)

```
Builder VM boots
  → Agent connects via WebSocket
  → Agent clones repo
  → Agent runs `docker build`
  → Agent streams logs to Core (displayed in Dashboard)
  → Agent pushes to Internal Registry
  → Agent reports "Build Complete" (artifact URL)
  → Core terminates Builder VM
```

### 3. Fan-In (Sync Point)

```
Core monitors: SELECT COUNT(*) FROM build_jobs WHERE workflow_run_id = X AND status != 'completed'
  → If count == 0 (all builds done):
      → If multi-arch: Core runs imagetools create to merge manifests
      → Core provisions Preview VM (User's cloud account)
```

### 4. Preview Phase

```
Preview VM boots
  → Agent connects via WebSocket
  → Agent receives DEPLOY command (includes secrets + image URL)
  → Agent generates docker-compose.stagely.yml (override file)
  → Agent runs `docker compose -f docker-compose.yml -f docker-compose.stagely.yml up -d`
  → Agent waits 5 seconds
  → Agent runs `docker compose ps --format json`
  → If all services "running":
      → Agent sends STATUS: healthy
      → Core updates Redis: route:abc123 → {ip: VM_IP, port: 3000}
      → Core posts GitHub comment: "✅ Preview ready: https://abc123.stagely.dev"
  → If any service "exited":
      → Agent sends STATUS: failed + last 20 lines of logs
      → Core posts GitHub comment: "❌ Deployment failed [View Logs]"
```

### 5. PR Closed Event

```
GitHub → Stagely Core webhook
  → Core marks environment as "terminated"
  → Core calls Cloud Provider API: TerminateInstance(vm_id)
  → Core deletes Redis key: route:abc123
  → Edge Proxy returns 404 immediately
```

## Cost Optimization: The Reaper

A background cron job runs every 5 minutes:

```sql
SELECT id, vm_id, provider FROM environments
WHERE status = 'running'
  AND (
    last_heartbeat < NOW() - INTERVAL '15 minutes' -- Agent disconnected
    OR created_at < NOW() - INTERVAL '24 hours'    -- Hard TTL
  );
```

For each stale environment:
- Call provider API to terminate VM
- Update environment status to "reaped"
- Delete Redis route

## Observability

### Metrics (Prometheus)
- Active environments count
- Build queue depth
- VM provisioning time (p50, p95, p99)
- Edge Proxy request rate
- Agent WebSocket connection count

### Logs (Structured JSON)
- All Agent logs streamed to Core
- Core writes to stdout (captured by Docker/systemd)
- Centralized logging: FluentBit → Loki/Elasticsearch

### Alerts
- Environment stuck in "building" >10 minutes
- Redis connection failures
- Cloud Provider API errors (quota exhausted)

## Security Considerations

### Secrets Management
- Never logged (masked in Agent stdout)
- Encrypted at rest (AES-256-GCM)
- Transmitted only over TLS WebSocket
- Temporary override files deleted after deployment

### Network Segmentation
- Core API in private subnet
- Edge Proxy in DMZ (public but read-only)
- User VMs fully isolated (no direct communication with Core database)

### Agent Authentication
- Token generated per-VM (single-use concept)
- JWT includes expiration (24 hours)
- Revocable: Core can reject connection if environment deleted

### Rate Limiting
- GitHub webhook HMAC verification
- Dashboard API: 100 req/min per user
- Edge Proxy: 1000 req/s per subdomain

## Scalability Targets

- **Concurrent Environments:** 1,000+
- **Build Throughput:** 50 parallel builds
- **Edge Proxy RPS:** 100,000+ (horizontal scaling)
- **Database Connections:** 200 (connection pooling)
- **WebSocket Connections:** 10,000+ (single Core instance with goroutines)

## Technology Choices Summary

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Backend | Go | Performance, static binary, excellent concurrency |
| Frontend | React + Shadcn + Tailwind | Modern, component library reduces development time |
| Database | PostgreSQL | ACID compliance, JSON support, mature ecosystem |
| Cache/Routing | Redis | Sub-millisecond reads, TTL support, simple data model |
| Container Runtime | Docker + Compose | Universal standard, mature tooling |
| Proxy | Go + httputil | Custom logic required, native performance |
| TLS | certmagic | Automatic cert management, production-proven |
| Agent Communication | WebSocket | Real-time bidirectional, firewall-friendly |
| VM Provisioning | Cloud Provider APIs | Native integration, programmatic control |

## Next Steps

This document provides the foundational architecture. Detailed specifications for each component are available in:

- `02-agent-protocol.md` - WebSocket message formats and state machine
- `03-secrets-management.md` - Encryption, injection, and scoping
- `04-build-pipeline.md` - Fan-out/fan-in orchestration and multi-arch
- `05-stagely-yaml-spec.md` - Configuration file reference
- `06-database-schema.md` - Complete table definitions and relationships
- `07-edge-proxy-routing.md` - Reverse proxy implementation details
- `08-cloud-provider-interface.md` - Pluggable provider abstraction
