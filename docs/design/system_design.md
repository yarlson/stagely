# 📘 Stagely System Design Document (v1.0)

## 1\. Executive Summary

Stagely is a self-hosted-style deployment platform designed to bring the "Vercel Experience" to standard Docker Compose infrastructures. It uses a **Hub-and-Spoke** architecture where a centralized Control Plane manages distributed Agents running on user servers.

**Core Philosophy:**

- **Zero-Touch:** Agents auto-register via cloud-init.
- **Zero-Config:** Works with standard `docker-compose.yml` files.
- **Security:** Outbound-only connections; secrets encrypted at rest; no source code stored on Stagely servers.

---

## 2\. The Configuration Spec: `stagely.yaml`

While Stagely works out-of-the-box with just a `docker-compose.yml`, the `stagely.yaml` file is an optional manifest placed in the root of the repository to define advanced deployment behaviors (Hooks, Paths, and Timeouts).

### 2.1 File Location

`./stagely.yaml` (Project Root)

### 2.2 Schema Specification

```yaml
version: "1.0"

# (Optional) Explicitly link repo to a project ID to prevent mismatch
project_id: "proj_abc123"

# (Optional) Path to your compose file if not standard
compose_file: "./deploy/docker-compose.prod.yml"

deployment:
  # (Optional) Timeout for the whole operation before rolling back
  timeout: 300s

  # (Optional) Strategy settings
  strategy: "recreate" # Options: recreate (default), stop-first

hooks:
  # Commands to run BEFORE the new containers are swapped in
  # Useful for database migrations.
  pre_deploy:
    - service: "backend" # The service context to run the command in
      command: "./migrate_db.sh"
      continue_on_error: false # If this fails, abort deployment

  # Commands to run AFTER health checks pass
  post_deploy:
    - service: "backend"
      command: "curl -X POST https://hooks.slack.com/..."

services:
  # Service-specific overrides
  backend:
    # Wait this long for health check (overrides Agent default)
    health_check_grace_period: 60s
    # If true, we ignore this service during updates
    ignore: false
```

---

## 3\. System Architecture

### 3.1 High-Level Topology

The system is composed of three tiers:

1.  **Frontend (UI):** React SPA (Vite) interacting with the Backend API.
2.  **Control Plane (Backend):** Monolithic Go API + WebSocket Hub.
3.  **Execution Plane (Agent):** Lightweight Go binary running on the User's VPS.

### 3.2 The Technology Stack

| Component         | Tech Choice              | Rationale                                          |
| :---------------- | :----------------------- | :------------------------------------------------- |
| **Repo Strategy** | Monorepo (Go Workspaces) | Code sharing between Agent/Server (`pkg/shared`).  |
| **Backend**       | Go (Gin + GORM)          | High performance, strict typing, easy concurrency. |
| **Agent**         | Go (Native)              | Single binary, low memory footprint (\<50MB).      |
| **Communication** | `coder/websocket`        | Real-time bidirectional streaming (Logs/Cmds).     |
| **Database**      | PostgreSQL               | Relational integrity for Users/Projects/Secrets.   |
| **Encryption**    | AES-256-GCM              | Application-level encryption for Secrets.          |

---

## 4\. Detailed Data Model

### 4.1 Database Schema (PostgreSQL)

**`users`**

- `id` (UUID): PK
- `github_id` (String): Index, Unique
- `email` (String)

**`projects`**

- `id` (UUID): PK
- `user_id` (UUID): FK -\> Users
- `name` (String): e.g., "my-saas-api"
- `repo_url` (String): Metadata only
- `agent_id` (UUID): FK -\> Agents (Nullable)

**`agents`**

- `id` (UUID): PK
- `token_hash` (String): Bcrypt hash of the Bearer token
- `name` (String): e.g., "Hetzner-Prod"
- `status` (Enum): `online` | `offline` | `busy`
- `last_heartbeat` (Timestamp)
- `version` (String): e.g., "v1.0.2"

**`secrets`**

- `id` (UUID): PK
- `project_id` (UUID): FK -\> Projects
- `scope` (Enum): `global` | `backend` | `frontend` | ...
- `key` (String): e.g., "DATABASE_URL"
- `value_encrypted` (Byte[]): AES Encrypted Blob
- `nonce` (Byte[]): AES Nonce

### 4.2 WebSocket Protocol (JSON Payloads)

**Topic: `server -> agent` (Commands)**

```json
{
  "type": "DEPLOY",
  "payload": {
    "job_id": "job_888",
    "config": {
      "compose_file": "docker-compose.yml",
      "hooks": { ... } // From stagely.yaml
    },
    "secrets": [
      { "key": "PORT", "value": "8080", "scope": "backend" }
    ]
  }
}
```

**Topic: `agent -> server` (Streams)**

```json
{
  "type": "LOG_CHUNK",
  "payload": {
    "job_id": "job_888",
    "stream": "stderr",
    "line": "Migration successful",
    "ts": 169999999
  }
}
```

---

## 5\. Core Workflows

### 5.1 The "Override" Deployment Strategy

This is the central logic of the Stagely Agent.

1.  **Receive Payload:** Agent gets the list of secrets and scope.
2.  **Generate Override:** Agent creates `docker-compose.stagely.yml`.
    ```yaml
    version: "3"
    services:
      backend:
        environment:
          - PORT=8080 # Injected
    ```
3.  **Execute:** Agent runs:
    `docker compose -f docker-compose.yml -f docker-compose.stagely.yml up -d --remove-orphans`
4.  **Verify:** Agent runs `docker compose ps --format json` to check for `State: running`.
5.  **Cleanup:** Agent deletes the `.stagely.yml` file.

### 5.2 The "Smart Convergence"

We rely on Docker's native idempotency.

- If we change an environment variable for `backend`, Docker detects the drift and recreates **only** that container.
- `frontend` and `db` remain untouched (Zero Downtime for them).

### 5.3 Zero-Touch Provisioning

1.  Stagely generates a `cloud-init` script containing:
    - Docker installation.
    - Stagely Agent container run command.
    - Injected `config.json` with `{ "token": "sk_live_..." }`.
2.  User pastes this into AWS/DigitalOcean User Data.
3.  Server boots -\> Agent starts -\> Authenticates -\> Appears "Online" in Dashboard.

---

## 6\. Security Model

1.  **Secret Isolation:** Secrets are stored encrypted. The raw value is only ever held in RAM by the Backend (briefly) and the Agent (briefly) during deployment.
2.  **Agent Authentication:** Agents authenticate via long-lived Bearer tokens. Tokens are write-only (once generated, not viewable again).
3.  **Command Safelisting:** The Agent effectively only allows specific Docker commands. It is not a generic "Remote Code Execution" shell. It cannot run `rm -rf /`.

---

## 7\. Folder Structure (Implementation View)

```text
/stagely-monorepo
├── go.work
├── /apps
│   ├── /agent
│   │   ├── /cmd          # Entrypoint
│   │   ├── /deployer     # Override & Docker Logic
│   │   ├── /websocket    # Reconnect logic
│   │   └── config.go     # Local config loader
│   ├── /server
│   │   ├── /api          # Gin Handlers
│   │   ├── /crypto       # AES GCM logic
│   │   └── /hub          # WebSocket Connection Pool
│   └── /web              # React/Vite App
└── /pkg
    └── /shared
        ├── /protocol     # Shared JSON Structs
        └── /models       # GORM Models
```
