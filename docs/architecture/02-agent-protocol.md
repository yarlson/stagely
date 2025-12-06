# Stagely Agent Communication Protocol

## Overview

The Stagely Agent is a lightweight Go binary that runs inside ephemeral VMs. It maintains a persistent WebSocket connection to the Stagely Core API to receive commands, execute deployments, and stream logs in real-time.

## Design Principles

1. **Agent Connects Outbound**: No inbound ports required on VM (firewall-friendly)
2. **Zero Configuration**: Agent identity and credentials injected via Cloud-Init
3. **Real-Time Bidirectional**: WebSocket enables instant command dispatch and log streaming
4. **Resilient**: Automatic reconnection with exponential backoff
5. **Stateless**: All state lives in Core; Agent is a pure executor

## Connection Lifecycle

### Phase 1: Bootstrap (Cloud-Init)

When Stagely Core provisions a VM, it injects a startup script:

```yaml
#cloud-config
write_files:
  - path: /etc/stagely/config.json
    permissions: '0600'
    owner: root:root
    content: |
      {
        "agent_id": "agt_8jk2n9s7d6f5g4h3",
        "token": "sk_live_9s8d7f6g5h4j3k2l1m0n9b8v7c6x5z4",
        "core_url": "wss://api.stagely.dev/v1/agent/connect",
        "environment_id": "env_xk82j9s7d6f5"
      }

runcmd:
  - curl -fsSL https://get.stagely.dev/agent/v1.0.0/linux-amd64 -o /usr/local/bin/stagely-agent
  - chmod +x /usr/local/bin/stagely-agent
  - systemctl enable --now stagely-agent
```

### Phase 2: Initial Connection

```
Agent boots → Reads /etc/stagely/config.json → Opens WebSocket connection
```

**WebSocket URL:**
```
wss://api.stagely.dev/v1/agent/connect
```

**Handshake Request (Agent → Core):**
```json
{
  "type": "HELLO",
  "version": "1.0.0",
  "agent_id": "agt_8jk2n9s7d6f5g4h3",
  "token": "sk_live_9s8d7f6g5h4j3k2l1m0n9b8v7c6x5z4",
  "environment_id": "env_xk82j9s7d6f5",
  "system_info": {
    "hostname": "ip-10-0-1-42",
    "ip_address": "54.123.45.67",
    "architecture": "amd64",
    "os": "linux",
    "docker_version": "24.0.5"
  }
}
```

**Handshake Response (Core → Agent):**

Success:
```json
{
  "type": "HELLO_ACK",
  "status": "connected",
  "agent_id": "agt_8jk2n9s7d6f5g4h3",
  "heartbeat_interval": 30
}
```

Failure:
```json
{
  "type": "ERROR",
  "code": "AUTH_FAILED",
  "message": "Invalid or expired token"
}
```

### Phase 3: Active State

Once connected, the Agent enters a loop:

1. Listen for commands from Core
2. Execute commands and stream output
3. Send periodic heartbeats (every 30s)
4. Report status changes

## Message Types

### Agent → Core Messages

#### 1. HELLO (Connection Initialization)
Already shown above.

#### 2. HEARTBEAT (Keep-Alive)
```json
{
  "type": "HEARTBEAT",
  "timestamp": "2025-12-06T14:30:00Z",
  "uptime_seconds": 3600,
  "load_average": [0.45, 0.52, 0.48],
  "memory_usage": {
    "total_mb": 4096,
    "available_mb": 2048
  },
  "disk_usage": {
    "total_gb": 50,
    "available_gb": 35
  }
}
```

**Core Response:**
```json
{
  "type": "HEARTBEAT_ACK"
}
```

#### 3. LOG (Streaming Output)
```json
{
  "type": "LOG",
  "job_id": "job_xk82j9s7",
  "stream": "stdout",
  "timestamp": "2025-12-06T14:30:01.234Z",
  "data": "Pulling image registry.internal/proj/abc:latest\n"
}
```

**Fields:**
- `stream`: "stdout" or "stderr"
- `data`: Raw log line (newline-terminated)
- `job_id`: Links log to specific job

#### 4. STATUS (State Report)
```json
{
  "type": "STATUS",
  "job_id": "job_xk82j9s7",
  "state": "completed",
  "exit_code": 0,
  "duration_seconds": 45.3,
  "services": [
    {
      "name": "backend",
      "status": "running",
      "container_id": "abc123def456",
      "port": 8080,
      "health": "healthy"
    },
    {
      "name": "frontend",
      "status": "running",
      "container_id": "def456abc789",
      "port": 3000,
      "health": "healthy"
    },
    {
      "name": "postgres",
      "status": "running",
      "container_id": "ghi789jkl012",
      "port": 5432,
      "health": "healthy"
    }
  ]
}
```

**State Values:**
- `pending`: Job received but not started
- `running`: Job in progress
- `completed`: Job finished successfully (exit_code: 0)
- `failed`: Job finished with error (exit_code: non-zero)

#### 5. ERROR (Execution Failure)
```json
{
  "type": "ERROR",
  "job_id": "job_xk82j9s7",
  "code": "DOCKER_BUILD_FAILED",
  "message": "Failed to build image: exit status 1",
  "context": {
    "command": "docker build -t myapp .",
    "exit_code": 1,
    "last_10_lines": [
      "Step 5/10 : RUN npm install",
      "npm ERR! code ENOTFOUND",
      "npm ERR! errno ENOTFOUND",
      "npm ERR! network request failed",
      "..."
    ]
  }
}
```

### Core → Agent Messages

#### 1. HELLO_ACK (Connection Acknowledgment)
Already shown above.

#### 2. DEPLOY (Deploy Command)
```json
{
  "type": "DEPLOY",
  "job_id": "job_xk82j9s7",
  "image": "registry.internal/project-123/env-456:abc123",
  "compose_file": "docker-compose.yml",
  "secrets": [
    {
      "key": "DATABASE_URL",
      "value": "postgres://user:pass@db.internal:5432/mydb",
      "scope": "global"
    },
    {
      "key": "PORT",
      "value": "8080",
      "scope": "backend"
    },
    {
      "key": "PORT",
      "value": "3000",
      "scope": "frontend"
    },
    {
      "key": "STRIPE_SECRET_KEY",
      "value": "sk_test_...",
      "scope": "backend"
    }
  ],
  "lifecycle": {
    "on_start": [
      {
        "service": "backend",
        "command": "npm run db:migrate"
      }
    ]
  }
}
```

**Agent Execution Flow:**

1. Agent pulls image (if not cached): `docker pull registry.internal/...`
2. Agent generates `docker-compose.stagely.yml` override file:

```yaml
version: '3'
services:
  backend:
    environment:
      - DATABASE_URL=postgres://user:pass@db.internal:5432/mydb
      - PORT=8080
      - STRIPE_SECRET_KEY=sk_test_...
  frontend:
    environment:
      - DATABASE_URL=postgres://user:pass@db.internal:5432/mydb
      - PORT=3000
  postgres:
    environment:
      - DATABASE_URL=postgres://user:pass@db.internal:5432/mydb
```

3. Agent runs: `docker compose -f docker-compose.yml -f docker-compose.stagely.yml up -d`
4. Agent waits 5 seconds (grace period)
5. Agent runs lifecycle hooks (if any): `docker compose exec backend npm run db:migrate`
6. Agent checks health: `docker compose ps --format json`
7. Agent reports STATUS: completed or failed

#### 3. BUILD (Build Command)

For Builder VMs only (not Preview VMs):

```json
{
  "type": "BUILD",
  "job_id": "job_build_xk82",
  "context": {
    "repo_url": "https://github.com/user/repo.git",
    "commit_hash": "abc123def456",
    "branch": "feature/new-api",
    "clone_token": "github_pat_..."
  },
  "build_config": {
    "context_path": "./api",
    "dockerfile": "Dockerfile",
    "target_image": "registry.internal/project-123/env-456:abc123",
    "platform": "linux/amd64",
    "build_args": {
      "NODE_ENV": "staging"
    },
    "cache_from": [
      "registry.internal/project-123/cache:backend"
    ],
    "cache_to": "registry.internal/project-123/cache:backend"
  },
  "registry_auth": {
    "username": "stagely",
    "password": "reg_token_..."
  }
}
```

**Agent Execution Flow:**

1. Clone repo: `git clone <repo_url> /workspace && cd /workspace && git checkout <commit_hash>`
2. Run build:
   ```bash
   docker buildx build \
     --platform linux/amd64 \
     --cache-from=type=registry,ref=registry.internal/project-123/cache:backend \
     --cache-to=type=registry,ref=registry.internal/project-123/cache:backend,mode=max \
     --build-arg NODE_ENV=staging \
     -t registry.internal/project-123/env-456:abc123 \
     -f Dockerfile \
     --push \
     ./api
   ```
3. Stream logs to Core (every line of `docker buildx` output)
4. Report STATUS: completed (with artifact URL) or failed

#### 4. TERMINATE (Shutdown Command)
```json
{
  "type": "TERMINATE",
  "reason": "pr_closed",
  "grace_period_seconds": 30
}
```

**Agent Execution Flow:**

1. Stop all containers: `docker compose down`
2. Send STATUS: terminated
3. Close WebSocket connection
4. Exit process (systemd or init will not restart it)

The VM itself is terminated by the Cloud Provider API (Agent does not self-destruct the VM).

#### 5. PING (Connection Test)
```json
{
  "type": "PING"
}
```

**Agent Response:**
```json
{
  "type": "PONG",
  "timestamp": "2025-12-06T14:30:05Z"
}
```

## Error Handling

### Agent Disconnection

If the WebSocket connection drops (network issue, Core restart):

1. Agent detects connection loss
2. Agent enters reconnection loop with exponential backoff:
   - Attempt 1: Wait 1s
   - Attempt 2: Wait 2s
   - Attempt 3: Wait 4s
   - Attempt 4: Wait 8s
   - Max wait: 60s
3. Agent retries connection with same token
4. Core validates token and resumes connection

**Suicide Mechanism:**
If Agent cannot reconnect for >15 minutes:
1. Agent stops all containers: `docker compose down`
2. Agent creates a marker file: `/var/lib/stagely/suicide_marker`
3. Agent exits

The Core's Reaper process will detect the stale environment and terminate the VM.

### Core Shutdown/Restart

Core maintains WebSocket connection state in memory. On restart:

1. All Agent connections are dropped
2. Agents automatically reconnect (exponential backoff)
3. Core validates tokens and re-establishes connections
4. Core sends STATUS_REQUEST to all reconnected Agents to rebuild state

```json
{
  "type": "STATUS_REQUEST"
}
```

Agent responds with current STATUS message.

## Security

### Authentication

- Token is a JWT signed by Core
- Payload includes:
  ```json
  {
    "agent_id": "agt_...",
    "environment_id": "env_...",
    "exp": 1733500800
  }
  ```
- Token is valid for 24 hours (can be refreshed)

### Encryption

- All communication over TLS (wss://)
- TLS 1.3 minimum
- Certificate pinning optional (future enhancement)

### Secret Masking

Agent masks secrets in logs before streaming:

```go
// Pseudo-code
for _, secret := range secrets {
    logLine = strings.ReplaceAll(logLine, secret.Value, "***REDACTED***")
}
```

## Agent State Machine

```
┌─────────────────┐
│  DISCONNECTED   │
└────────┬────────┘
         │
         │ (Boot + Read Config)
         v
┌─────────────────┐
│  CONNECTING     │
└────────┬────────┘
         │
         │ (HELLO sent)
         v
┌─────────────────┐     HELLO_ACK received
│  AUTHENTICATING ├──────────────────────┐
└────────┬────────┘                      │
         │                               │
         │ (Auth Failed)                 │
         v                               │
┌─────────────────┐                      │
│  DISCONNECTED   │                      │
└─────────────────┘                      │
                                         v
                               ┌─────────────────┐
                               │     IDLE        │
                               └────────┬────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            │                           │                           │
            │ (DEPLOY received)         │ (BUILD received)          │ (HEARTBEAT timer)
            v                           v                           v
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   DEPLOYING     │         │   BUILDING      │         │  HEARTBEATING   │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         │ (STATUS: completed)       │ (STATUS: completed)       │
         v                           v                           │
┌─────────────────┐         ┌─────────────────┐                 │
│   DEPLOYED      │         │   BUILT         │                 │
└────────┬────────┘         └────────┬────────┘                 │
         │                           │                           │
         └───────────────┬───────────┴───────────────────────────┘
                         │
                         │ (TERMINATE received)
                         v
                ┌─────────────────┐
                │  TERMINATING    │
                └────────┬────────┘
                         │
                         │ (Clean shutdown)
                         v
                ┌─────────────────┐
                │  DISCONNECTED   │
                └─────────────────┘
```

## Implementation Notes

### Go Agent Structure

```go
type Agent struct {
    Config    AgentConfig
    Conn      *websocket.Conn
    State     AgentState
    JobQueue  chan Job
    Logger    *slog.Logger
    Docker    *dockerclient.Client
}

func (a *Agent) Run() error {
    // Load config from /etc/stagely/config.json
    // Connect to Core via WebSocket
    // Send HELLO
    // Wait for HELLO_ACK
    // Enter event loop
    for {
        select {
        case msg := <-a.Conn.ReadMessage():
            a.HandleMessage(msg)
        case <-time.After(30 * time.Second):
            a.SendHeartbeat()
        }
    }
}

func (a *Agent) HandleMessage(msg Message) {
    switch msg.Type {
    case "DEPLOY":
        go a.ExecuteDeploy(msg)
    case "BUILD":
        go a.ExecuteBuild(msg)
    case "TERMINATE":
        a.Shutdown()
    }
}
```

### Core WebSocket Handler

```go
func (s *Server) HandleAgentConnection(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }

    // Read HELLO message
    var hello HelloMessage
    conn.ReadJSON(&hello)

    // Validate token
    claims, err := s.ValidateToken(hello.Token)
    if err != nil {
        conn.WriteJSON(ErrorMessage{Code: "AUTH_FAILED"})
        conn.Close()
        return
    }

    // Register connection
    s.Agents[claims.AgentID] = conn

    // Send HELLO_ACK
    conn.WriteJSON(HelloAckMessage{Status: "connected"})

    // Enter read loop
    for {
        var msg Message
        err := conn.ReadJSON(&msg)
        if err != nil {
            delete(s.Agents, claims.AgentID)
            return
        }
        s.HandleAgentMessage(claims.AgentID, msg)
    }
}
```

## Message Size Limits

- Maximum message size: 10 MB (for large log chunks)
- Logs are batched: Agent buffers up to 100 lines or 1 second (whichever comes first)
- If a single log line exceeds 1 MB, it is truncated

## Metrics and Observability

### Agent Metrics (exposed via local HTTP endpoint)

```
GET http://localhost:9090/metrics

stagely_agent_uptime_seconds 3600
stagely_agent_jobs_completed 5
stagely_agent_jobs_failed 1
stagely_agent_ws_reconnects 2
stagely_agent_last_heartbeat_timestamp 1733500800
```

### Core Tracks:

- Number of connected Agents
- Message throughput (messages/sec)
- Average job execution time
- Connection churn rate (connects/disconnects per minute)

## Testing

### Local Testing (Mock Core)

```bash
# Run a simple WebSocket echo server for testing
go run test/mock_core.go

# Run Agent with test config
STAGELY_CORE_URL=ws://localhost:8080/test ./stagely-agent
```

### Integration Testing

1. Provision a real VM (e.g., DigitalOcean Droplet)
2. Inject test Cloud-Init script
3. Core sends BUILD command
4. Verify Agent streams logs
5. Verify Agent reports STATUS: completed
6. Terminate VM

## Version Compatibility

- Protocol Version: `1.0.0`
- Core must support all Agent versions within the same major version
- If Core receives `"version": "2.0.0"`, it responds with:

```json
{
  "type": "ERROR",
  "code": "VERSION_MISMATCH",
  "message": "This Core supports Agent version 1.x.x only"
}
```

## Future Enhancements

1. **Compression**: Enable WebSocket compression for log streaming
2. **Binary Protocol**: Switch to Protocol Buffers for efficiency
3. **Multi-Core**: Support multiple Core endpoints (failover/load balancing)
4. **Certificate Pinning**: Agent validates Core's TLS certificate fingerprint
5. **Command Queueing**: Agent can handle multiple jobs concurrently
