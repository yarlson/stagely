# Stagely Roadmap: Autonomous Deployment Platform

**Status:** Ready for Execution
**Priority:** HIGH
**Created:** 2025-12-06
**Language:** Go (Backend/Agent), TypeScript (Frontend)
**Stack:** React (Vite), GORM, Postgres, `coder/websocket`
**Repo Strategy:** Monorepo (Go Workspaces)

**Project Goal:**
Build a self-hosted-style deployment platform where a lightweight Go Agent manages Docker Compose applications via instructions from a central Dashboard.

**Success Metrics:**

- ✅ Agent connects to Backend via WebSocket and stays stable.
- ✅ "One-click" deployment pushes secrets without touching user files.
- ✅ Docker Compose updates are zero-downtime (via convergence).
- ✅ UI shows real-time status and logs.

**Estimated Timeline:**

- Phase 0: Foundation (Repo & Contracts)
- Phase 1: Connectivity (The "Ping")
- Phase 2: Agent Execution Engine
- Phase 3: Backend Control Plane
- Phase 4: Frontend Dashboard
- Phase 5: Real-Time Polish
- **Total Estimated Effort:** ~4-5 Weeks (MVP)

---

## Phase 0: Foundation & Contracts

**Problem Statement:**
Need a unified codebase where Agent and Server share communication protocols, but maintain separate binary dependencies.

**Solution Overview:**
Set up a Go Workspaces monorepo. Create the shared JSON contracts that define how the Agent talks to the Server.

**Implementation Details:**

- **Structure:**
  - `go.work` (Workspace file)
  - `/apps/agent/go.mod`
  - `/apps/server/go.mod`
  - `/pkg/shared/go.mod` (Protocol definitions)
- **Shared Contracts (`/pkg/shared`):**
  - `Secret` struct (Key, Value, Scope).
  - `DeployPayload` struct (List of secrets).
  - `LogMessage` struct (Stream output).
- **Database:** Setup PostgreSQL with GORM connection in Server.

**Success Criteria:**

- ✅ Monorepo structure compiles.
- ✅ Shared types are importable by both apps.
- ✅ Database is reachable via GORM.

---

## Phase 1: Connectivity (The "Ping")

**Problem Statement:**
The Agent needs to register itself securely and maintain a persistent connection for instructions.

**Solution Overview:**
Implement a WebSocket server (using `github.com/coder/websocket`) and an Agent client that authenticates via a token.

**Implementation Details:**

- **Server:**
  - WebSocket endpoint `/api/v1/stream`.
  - Auth Middleware: Validate `Authorization: Bearer <AGENT_TOKEN>`.
  - Connection Manager (Map of `AgentID` -> `Conn`).
- **Agent:**
  - Connect to WS on boot.
  - Implement Reconnect Logic (Exponential backoff).
  - Send "Heartbeat" every 30s.

**Success Criteria:**

- ✅ Agent connects and upgrades to WS.
- ✅ Server logs "Agent Connected".
- ✅ Disconnecting the Agent triggers cleanup on Server.

---

## Phase 2: Agent Execution Engine (The "Hands")

**Problem Statement:**
The Agent needs to modify configuration and control Docker without mutating user source code.

**Solution Overview:**
Implement the **Override Strategy**. Generate temporary YAML files and shell out to the `docker` CLI.

**Implementation Details:**

- **Logic:**
  - Parse `docker-compose.yml` to find service names.
  - Generate `docker-compose.stagely.yml` (Inject Global/Scoped secrets).
- **Execution (Shell Out):**
  - `exec.Command("docker", "compose", "-f", "...", "up", "-d")`.
  - `exec.Command("docker", "compose", "ps", "--format", "json")` for health.
- **Cleanup:**
  - `defer os.Remove("docker-compose.stagely.yml")`.

**Success Criteria:**

- ✅ Can deploy a test app locally using generated secrets.
- ✅ Secrets are strictly isolated (Scoped vs Global).
- ✅ Temporary files are deleted after run.
- ✅ Health check correctly identifies "Up" vs "Exit".

---

## Phase 3: Backend Control Plane (The "Brain")

**Problem Statement:**
We need to store user secrets securely and trigger the deployment actions.

**Solution Overview:**
Build the REST API for managing projects and secrets, using AES-GCM for encryption at rest.

**Implementation Details:**

- **Security:**
  - `Encrypt(text, key)` / `Decrypt(text, key)` helper using `crypto/aes`.
  - Master key stored in server Env (`APP_MASTER_KEY`).
- **API Endpoints:**
  - `POST /projects`
  - `POST /secrets` (Stored encrypted).
  - `POST /deploy/:project_id` -> **Triggers WebSocket Push**.
- **WS Integration:**
  - When Deploy API is hit, look up Agent Connection.
  - Send `JSON(DeployPayload)` down the socket.

**Success Criteria:**

- ✅ Secrets in DB look like garbage (Encrypted).
- ✅ Hitting the Deploy API causes the Agent to log "Received Job".

---

## Phase 4: Frontend Dashboard (The Face)

**Problem Statement:**
Users need a way to manage this without curl commands.

**Solution Overview:**
A clean React (Vite) dashboard.

**Implementation Details:**

- **Auth:** GitHub OAuth flow (Frontend -> Backend -> GitHub).
- **UI Components:**
  - Project List.
  - Secret Manager (Table with Scope selector).
  - **"Deploy" Button.**
  - Status Indicator (Connected/Disconnected).
- **State:** React Query for fetching data.

**Success Criteria:**

- ✅ User can login via GitHub.
- ✅ User can add a secret and click Deploy.
- ✅ UI updates when Agent status changes.

---

## Phase 5: Real-Time Polish & Provisioning

**Problem Statement:**
Users need to see what is happening _now_ (logs) and onboard easily.

**Solution Overview:**
Stream Docker logs over the existing WebSocket and script the cloud-init process.

**Implementation Details:**

- **Log Streaming:**
  - Agent: Run `docker compose logs -f` and pipe Stdout to WS Channel.
  - Frontend: Xterm.js or simple text area to append incoming lines.
- **Provisioning:**
  - Create `cloud-init.yaml` template.
  - API endpoint to generate a "Registration Command" (`curl | bash`) for manual install.

**Success Criteria:**

- ✅ User sees "Container Creating..." logs in browser real-time.
- ✅ New server auto-appears in Dashboard after running install script.

---
