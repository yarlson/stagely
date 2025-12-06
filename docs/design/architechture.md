### 1\. High-Level Topology

The system consists of three distinct physical tiers:

1.  **The User Tier (Browser):** Runs the React Dashboard. Talks to the Backend via HTTPS (REST) and WSS (WebSockets).
2.  **The Control Tier (Stagely Cloud):** Runs the Go API and PostgreSQL Database. It acts as the "Command Center."
3.  **The Execution Tier (User's Server):** Runs the Go Agent and the User's Docker containers. It connects _outbound_ to the Control Tier.

---

### 2\. Component Deep Dive

#### A. The Control Plane (Backend)

- **Stack:** Go (Gin/Chi), GORM, `coder/websocket`.
- **Role:** The "Source of Truth."
- **Key Modules:**
  - **Auth Manager:** Handles GitHub OAuth and issues JWTs for users.
  - **Secret Vault:** Encrypts secrets using AES-GCM before writing to Postgres.
  - **WebSocket Hub:** Maintains a map of active connections (`Map<AgentID, *Connection>`). It routes messages from the REST API ("Deploy Project 1") to the specific active socket connection.

#### B. The Data Plane (The Agent)

- **Stack:** Go (Native Binary), Docker CLI.
- **Role:** The "Executor."
- **Key Modules:**
  - **Connection Manager:** Initiates the outbound WebSocket connection and handles auto-reconnection (backoff strategy).
  - **Config Merger:** Implements the logic to read `docker-compose.yml`, parse the Services, and generate the `docker-compose.stagely.yml` override file.
  - **Command Runner:** A wrapper around `os/exec` that executes `docker compose` commands and captures `Stdout`/`Stderr` to stream back to the Hub.

#### C. The Database (PostgreSQL)

- **Schema Structure:**
  - `Users` (GitHub ID, Access Tokens)
  - `Agents` (ID, Token, Status, LastHeartbeat)
  - `Projects` (Repo URL, Docker Compose path)
  - `Secrets` (Key, EncryptedValue, Scope, ProjectID)

---

### 3\. The "Deploy" Sequence (The Core Loop)

This is the most critical flow in the system. Here is how data moves when a user clicks "Deploy".

1.  **Trigger:** User clicks "Deploy" on Frontend.
    - _Payload:_ `POST /api/deploy/{project_id}`.
2.  **Lookup:** Backend fetches the Project's secrets from DB.
    - _Action:_ Decrypts secrets in memory.
    - _Action:_ Group secrets by Scope (Global vs. Service).
3.  **Dispatch:** Backend finds the active WebSocket for that Project's Agent.
    - _Action:_ Pushes JSON payload: `{ type: "DEPLOY", secrets: [...] }`.
4.  **Generation (Agent Side):**
    - Agent receives JSON.
    - Agent reads local `docker-compose.yml`.
    - Agent generates `docker-compose.stagely.yml`.
5.  **Execution (Agent Side):**
    - Agent runs: `docker compose -f docker-compose.yml -f docker-compose.stagely.yml up -d`.
    - **Stream:** Agent pipes the output of this command back through the WebSocket.
6.  **Verification:**
    - Agent waits 5 seconds.
    - Agent runs `docker compose ps --format json`.
    - Agent reports final status: `SUCCESS` or `FAIL`.
7.  **Cleanup:**
    - Agent deletes `docker-compose.stagely.yml`.

---

### 4\. Security Architecture

This design minimizes attack surface.

- **Zero Inbound Ports:** The User's server does **not** need to open port 22 (SSH) or any other port to the internet. The Agent makes an _outbound_ connection to Stagely. This passes through standard NAT/Firewalls easily.
- **Encryption at Rest:** If the Stagely Database is compromised, the attackers only see encrypted strings (e.g., `a8f93...`), not the actual API keys.
- **Ephemeral Secrets:** Secrets only exist on the User's server disk for the milliseconds it takes Docker to read them during boot. They are deleted immediately after.
- **Agent Scoping:** An Agent is bound to a specific Project/Environment. It cannot receive commands meant for another user's infrastructure.

---

### 5\. Directory Structure (Monorepo)

Based on your choice of **Go Workspaces**, here is the physical architecture of the code:

```text
/stagely-monorepo
├── go.work                  # Workspace definition
├── /apps
│   ├── /agent               # The Go Agent
│   │   ├── main.go
│   │   ├── /docker          # Docker CLI wrappers
│   │   ├── /merger          # YAML override logic
│   │   └── go.mod
│   │
│   ├── /server              # The Control Plane
│   │   ├── main.go
│   │   ├── /api             # REST handlers
│   │   ├── /ws              # WebSocket Hub
│   │   ├── /db              # GORM models
│   │   └── go.mod
│   │
│   └── /web                 # The React Frontend
│       ├── package.json
│       └── /src
│
└── /pkg                     # Shared Go Code
    └── /shared
        ├── protocol.go      # Structs: DeployPayload, LogMessage
        ├── types.go         # Structs: Secret, Scope
        └── go.mod
```
