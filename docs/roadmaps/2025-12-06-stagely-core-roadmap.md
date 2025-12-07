# Stagely Core Implementation Roadmap

**Status:** Ready for Execution
**Priority:** HIGH
**Created:** 2025-12-06
**Language:** Go 1.22+
**Testing Framework:** Go testing package + testify + testcontainers
**Linting:** golangci-lint

**Project Goal:** Build the backend control plane for Stagely, a self-hosted ephemeral preview environment platform that provisions VMs, orchestrates Docker builds, and manages WebSocket-connected agents.

**Target Audience:** Development teams needing production-like testing environments for GitHub Pull Requests with full VM control and multi-cloud support.

**Success Metrics:**

- Successfully provision VMs across multiple cloud providers (AWS, DigitalOcean, Hetzner)
- Handle 50+ concurrent builds
- Support 1000+ active preview environments
- Sub-100ms API response times
- Agent WebSocket connections maintained with automatic reconnection
- Build pipeline fan-out/fan-in orchestration working correctly

**Estimated Timeline:**

- Phase 0: 16 hours ✅ COMPLETE
- Phase 1A: 4 hours (Interface + Mock + Registry) ✅ COMPLETE
- Phase 1B: 6 hours (AWS Provider) ✅ COMPLETE
- Phase 1C: 5 hours (DigitalOcean Provider)
- Phase 1D: 5 hours (Hetzner Provider)
- Phase 2: 24 hours
- Phase 3: 20 hours
- Phase 4: 24 hours
- Phase 5: 16 hours
- Phase 6: 20 hours
- Phase 7: 16 hours
- Phase 8: 12 hours
- Phase 9: 12 hours
- **Total:** 180 hours (4-5 weeks for single developer)

---

## Phase 0: Project Foundation and Database Setup

**Problem Statement:**
Need a solid foundation for the Stagely Core application including project structure, configuration management, database schema, and basic utilities. Without this foundation, subsequent development would lack consistency and proper data persistence.

**Solution Overview:**
Create Go project structure following the standard layout with `cmd/`, `internal/`, and `pkg/` directories. Implement configuration management using Viper for environment variables. Set up PostgreSQL database with GORM ORM and create all core tables (teams, users, projects, environments, workflow_runs, build_jobs, secrets). Implement database migrations system.

**Success Criteria:**

- ✅ Project directory structure created with proper Go module initialization
- ✅ Configuration loading working (environment variables via Viper)
- ✅ PostgreSQL connection established with connection pooling
- ✅ All database tables created via migrations (14 core tables)
- ✅ GORM models defined for all entities with proper relationships
- ✅ Database indexes created for performance-critical queries
- ✅ Basic utility functions (NanoID generation, UUID handling)
- ✅ All tests passing (database connection, model CRUD)
- ✅ README with local setup instructions

**Implementation Details:**

- Create `cmd/core/main.go` as entry point for Core API
- Create `internal/config/config.go` with Viper configuration struct
- Create `internal/models/` with GORM models:
  - `team.go` - Top-level tenant isolation
  - `user.go` - User accounts
  - `team_member.go` - Many-to-many relationship
  - `project.go` - Git repository configuration
  - `cloud_provider.go` - User cloud credentials (encrypted)
  - `environment.go` - Ephemeral preview environments (stagelets)
  - `workflow_run.go` - Build→deploy→test pipeline tracking
  - `build_job.go` - Individual Docker image builds
  - `build_log.go` - Streaming build output
  - `secret.go` - Encrypted environment variables and files
  - `audit_log.go` - Compliance audit trail
  - `agent_connection.go` - Active WebSocket connections
- Create `migrations/` directory with numbered SQL files:
  - `001_create_teams.sql`
  - `002_create_users.sql`
  - `003_create_team_members.sql`
  - etc.
- Implement `pkg/nanoid/nanoid.go` for subdomain hash generation
- Create `internal/crypto/encrypt.go` with AES-256-GCM encryption functions
- Set up `go.mod` with required dependencies:
  - `gorm.io/gorm`
  - `gorm.io/driver/postgres`
  - `github.com/spf13/viper`
  - `github.com/matoous/go-nanoid/v2`
- Create `docker-compose.yml` for local PostgreSQL and Redis
- Add `Makefile` with targets: `build`, `test`, `migrate-up`, `migrate-down`

**Dependencies:**

- None (foundational phase)

**Testing Strategy:**

- Unit tests for NanoID generation (validate format, uniqueness)
- Unit tests for encryption/decryption (round-trip, tamper detection)
- Integration tests for database connection using testcontainers
- Integration tests for GORM model CRUD operations
- Test migration up/down (idempotency, rollback)
- Edge cases: Invalid database URLs, connection failures, duplicate keys

**Estimated Effort:** 16 hours

---

## Phase 1A: Cloud Provider Interface and Mock Implementation

**Problem Statement:**
Stagely needs to provision VMs across multiple cloud providers (AWS, DigitalOcean, Hetzner) with different APIs and instance types. Without a unified abstraction, the core orchestrator would need provider-specific logic, making it difficult to add new providers or maintain existing ones.

**Solution Overview:**
Define a `CloudProvider` interface in Go that abstracts VM lifecycle operations (CreateInstance, GetInstanceStatus, TerminateInstance). Implement a mock provider for testing and a provider registry for dynamic provider instantiation. This phase establishes the foundation before implementing real cloud providers.

**Success Criteria:**

- ✅ `CloudProvider` interface defined with all required methods
- ✅ Instance size mapping (small/medium/large → provider types)
- ✅ Architecture mapping (amd64/arm64 constants)
- ✅ Mock provider implementation for testing (in-memory, no API calls)
- ✅ Provider registry working (dynamic provider instantiation by name)
- ✅ All mock provider tests passing
- ✅ Thread-safe provider cache in registry

**Implementation Details:**

- Create `internal/providers/provider.go`:

  ```go
  type CloudProvider interface {
      Name() string
      CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error)
      GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error)
      TerminateInstance(ctx context.Context, instanceID string) error
      ValidateCredentials(ctx context.Context) error
      GetPricing(ctx context.Context, size, region string) (float64, error)
  }

  type InstanceSpec struct {
      Size         string // "small", "medium", "large"
      Architecture string // "amd64", "arm64"
      Region       string
      UserData     string // Cloud-Init script
      Tags         map[string]string
      SpotInstance bool
  }

  type InstanceStatus struct {
      State      string // "pending", "running", "stopped", "terminated"
      PublicIP   string
      PrivateIP  string
      LaunchedAt time.Time
      Ready      bool
  }
  ```

- Create `internal/providers/mock.go`:
  - In-memory mock for testing
  - Simulates provisioning delays with configurable duration
  - Tracks instances in memory map
  - No actual API calls
  - Support all CloudProvider interface methods
- Create `internal/providers/registry.go`:
  - Provider registration system
  - Factory pattern for creating providers from credentials
  - Thread-safe provider cache using sync.RWMutex
  - Register() and Get() methods

**Dependencies:**

- Phase 0 (database models, encryption utilities)

**Testing Strategy:**

- Unit tests for provider registry (registration, retrieval, thread safety)
- Unit tests for mock provider:
  - CreateInstance → returns valid instance ID and IP
  - GetInstanceStatus → returns correct state
  - TerminateInstance → removes from memory
  - ValidateCredentials → always succeeds
  - GetPricing → returns mock pricing
- Edge cases: Concurrent registry access, invalid instance IDs, duplicate registrations

**Estimated Effort:** 4 hours

---

## Phase 1B: AWS Provider Implementation

**Problem Statement:**
Need to provision EC2 instances on AWS with proper instance type selection, AMI selection based on architecture, spot instance support, and IP polling.

**Solution Overview:**
Implement the CloudProvider interface for AWS using aws-sdk-go-v2/service/ec2. Map generic sizes to EC2 instance types, handle architecture-specific AMI selection, support spot instances, and poll for public IP assignment.

**Success Criteria:**

- ✅ AWS provider implements CloudProvider interface
- ✅ Instance type mapping (small→t3.small/t4g.small, medium→c5.xlarge/c6g.xlarge, large→c5.2xlarge/c6g.2xlarge)
- ✅ AMI selection based on architecture (Ubuntu 22.04 AMD64/ARM64)
- ✅ Spot instance support
- ✅ Public IP polling with timeout
- ✅ All AWS provider tests passing
- ✅ Integration test with mocked AWS SDK

**Implementation Details:**

- Create `internal/providers/aws.go`:
  - Implement using aws-sdk-go-v2/service/ec2
  - Map sizes: small→t3.small, medium→c5.xlarge, large→c5.2xlarge
  - Map ARM: small→t4g.small, medium→c6g.xlarge, large→c6g.2xlarge
  - Handle spot instance requests
  - Wait for public IP assignment (polling with timeout)
  - Select AMI based on architecture (Ubuntu 22.04 AMD64/ARM64)
- Add AWS SDK dependency to `go.mod`:
  - `github.com/aws/aws-sdk-go-v2`
  - `github.com/aws/aws-sdk-go-v2/service/ec2`
  - `github.com/aws/aws-sdk-go-v2/config`

**Dependencies:**

- Phase 1A (CloudProvider interface, registry)

**Testing Strategy:**

- Unit tests for instance type selection (size+arch → EC2 type)
- Unit tests for AMI selection (arch → AMI ID)
- Integration tests with mocked EC2 client:
  - CreateInstance → verify RunInstances called with correct params
  - GetInstanceStatus → verify DescribeInstances called
  - TerminateInstance → verify TerminateInstances called
- Edge cases: Invalid region, quota exceeded, network timeouts

**Estimated Effort:** 6 hours

---

## Phase 1C: DigitalOcean Provider Implementation

**Problem Statement:**
Need to provision Droplets on DigitalOcean with size mapping and IP polling.

**Solution Overview:**
Implement the CloudProvider interface for DigitalOcean using godo SDK. Map generic sizes to DigitalOcean slugs, poll for droplet public IP, use Ubuntu 22.04 image.

**Success Criteria:**

- ✅ DigitalOcean provider implements CloudProvider interface
- ✅ Instance size mapping (small→s-2vcpu-4gb, medium→c-4, large→c-8)
- ✅ Public IP polling with timeout
- ✅ Ubuntu 22.04 image selection
- ✅ All DigitalOcean provider tests passing
- ✅ Integration test with mocked godo client

**Implementation Details:**

- Create `internal/providers/digitalocean.go`:
  - Implement using github.com/digitalocean/godo
  - Map sizes: small→s-2vcpu-4gb, medium→c-4, large→c-8
  - Note: DigitalOcean doesn't support ARM64 (return error or use AMD64 with warning)
  - Wait for droplet to get public IP
  - Use ubuntu-22-04-x64 image
- Add DigitalOcean SDK dependency to `go.mod`:
  - `github.com/digitalocean/godo`

**Dependencies:**

- Phase 1A (CloudProvider interface, registry)

**Testing Strategy:**

- Unit tests for size mapping
- Integration tests with mocked godo client:
  - CreateInstance → verify Droplets.Create called
  - GetInstanceStatus → verify Droplets.Get called
  - TerminateInstance → verify Droplets.Delete called
- Edge cases: ARM64 requested (should error), invalid token, network timeouts

**Estimated Effort:** 5 hours

---

## Phase 1D: Hetzner Provider Implementation

**Problem Statement:**
Need to provision servers on Hetzner Cloud with size/architecture mapping.

**Solution Overview:**
Implement the CloudProvider interface for Hetzner using hcloud-go SDK. Map generic sizes to Hetzner server types (including ARM-specific CAX types), use immediate IP availability.

**Success Criteria:**

- ✅ Hetzner provider implements CloudProvider interface
- ✅ Instance size mapping (small→cx21, medium→cx31, large→cx41)
- ✅ ARM instance mapping (small→cax11, medium→cax21, large→cax31)
- ✅ Immediate IP availability (no polling needed)
- ✅ All Hetzner provider tests passing
- ✅ Integration test with mocked hcloud client

**Implementation Details:**

- Create `internal/providers/hetzner.go`:
  - Implement using github.com/hetznercloud/hcloud-go
  - Map sizes: small→cx21, medium→cx31, large→cx41
  - Map ARM: small→cax11, medium→cax21, large→cax31
  - Hetzner returns IP immediately (no polling needed)
  - Use Ubuntu 22.04 image
- Add Hetzner SDK dependency to `go.mod`:
  - `github.com/hetznercloud/hcloud-go/v2`

**Dependencies:**

- Phase 1A (CloudProvider interface, registry)

**Testing Strategy:**

- Unit tests for size+architecture mapping
- Integration tests with mocked hcloud client:
  - CreateInstance → verify Server.Create called
  - GetInstanceStatus → verify Server.Get called
  - TerminateInstance → verify Server.Delete called
- Edge cases: Invalid API token, network timeouts, invalid region

**Estimated Effort:** 5 hours

---

## Phase 2: HTTP API and Authentication

**Problem Statement:**
Need a RESTful API for the Dashboard and CLI to interact with Stagely Core. Must support CRUD operations for teams, projects, environments, and secrets. Requires JWT-based authentication, role-based access control (RBAC), rate limiting, and proper error handling.

**Solution Overview:**
Build HTTP API using Gin framework. Implement JWT authentication middleware with user context injection. Create handlers for all resource types (teams, projects, environments, secrets). Implement RBAC checks at the handler level. Add middleware for CORS, logging, rate limiting, and error recovery. Use structured JSON responses with proper HTTP status codes.

**Success Criteria:**

- ✅ Gin router configured with all routes
- ✅ JWT authentication middleware working (token validation, user context)
- ✅ RBAC middleware enforcing team membership and roles
- ✅ CRUD handlers for teams (create, get, list, update, delete)
- ✅ CRUD handlers for projects (with team scoping)
- ✅ CRUD handlers for environments (with status filtering)
- ✅ CRUD handlers for secrets (encrypted storage, scope validation)
- ✅ GitHub webhook handler (PR opened, synchronized, closed)
- ✅ CORS middleware configured
- ✅ Request logging middleware (structured JSON logs)
- ✅ Rate limiting middleware (100 req/min per user)
- ✅ Error recovery middleware (panic handling)
- ✅ All API tests passing (unit + integration)
- ✅ API documentation (inline comments for future OpenAPI generation)

**Implementation Details:**

- Create `internal/api/routes.go`:

  ```go
  func SetupRouter(db *gorm.DB, redis *redis.Client) *gin.Engine {
      r := gin.New()
      r.Use(middleware.Logger())
      r.Use(middleware.Recovery())
      r.Use(middleware.CORS())

      // Public routes
      r.POST("/v1/webhooks/github", handlers.HandleGitHubWebhook)

      // Authenticated routes
      auth := r.Group("/v1")
      auth.Use(middleware.Auth())
      {
          // Teams
          auth.GET("/teams", handlers.ListTeams)
          auth.POST("/teams", handlers.CreateTeam)
          auth.GET("/teams/:team_slug", handlers.GetTeam)
          auth.PUT("/teams/:team_slug", handlers.UpdateTeam)
          auth.DELETE("/teams/:team_slug", handlers.DeleteTeam)

          // Projects
          auth.GET("/teams/:team_slug/projects", handlers.ListProjects)
          auth.POST("/teams/:team_slug/projects", handlers.CreateProject)
          auth.GET("/projects/:project_id", handlers.GetProject)
          auth.PUT("/projects/:project_id", handlers.UpdateProject)
          auth.DELETE("/projects/:project_id", handlers.DeleteProject)

          // Environments
          auth.GET("/projects/:project_id/environments", handlers.ListEnvironments)
          auth.GET("/environments/:environment_id", handlers.GetEnvironment)
          auth.DELETE("/environments/:environment_id", handlers.DeleteEnvironment)

          // Secrets
          auth.GET("/projects/:project_id/secrets", handlers.ListSecrets)
          auth.POST("/projects/:project_id/secrets", handlers.CreateSecret)
          auth.PATCH("/secrets/:secret_id", handlers.UpdateSecret)
          auth.DELETE("/secrets/:secret_id", handlers.DeleteSecret)
      }

      return r
  }
  ```

- Create `internal/api/middleware/auth.go`:
  - Parse JWT from Authorization header
  - Validate token signature and expiration
  - Load user from database
  - Inject user into Gin context
  - Return 401 for invalid/missing tokens
- Create `internal/api/middleware/rbac.go`:
  - Check team membership for team-scoped operations
  - Validate user role (owner, admin, member, viewer)
  - Return 403 for insufficient permissions
- Create `internal/api/middleware/cors.go`:
  - Allow origins (configurable, default: dashboard domain)
  - Allow methods: GET, POST, PUT, PATCH, DELETE
  - Allow headers: Authorization, Content-Type
- Create `internal/api/middleware/logger.go`:
  - Log request method, path, status, duration
  - Use structured logging (zerolog)
  - Mask sensitive headers (Authorization)
- Create `internal/api/middleware/ratelimit.go`:
  - Use Redis for rate limiting
  - Key: `ratelimit:{user_id}`
  - Limit: 100 requests per minute
  - Return 429 with Retry-After header
- Create `internal/api/handlers/teams.go`:
  - `CreateTeam`: Validate slug uniqueness, create team, add creator as owner
  - `GetTeam`: Check membership, return team details
  - `ListTeams`: Return teams where user is member
  - `UpdateTeam`: Check admin role, update name/settings
  - `DeleteTeam`: Check owner role, soft delete
- Create `internal/api/handlers/projects.go`:
  - `CreateProject`: Validate team membership, create project
  - `GetProject`: Check team membership, return project with cloud provider config
  - `ListProjects`: Return projects for team
  - `UpdateProject`: Update repo URL, settings
  - `DeleteProject`: Soft delete, cascade to environments
- Create `internal/api/handlers/environments.go`:
  - `ListEnvironments`: Filter by status, PR number
  - `GetEnvironment`: Return environment with build status, logs URL
  - `DeleteEnvironment`: Terminate VM, update status
- Create `internal/api/handlers/secrets.go`:
  - `CreateSecret`: Encrypt value, validate scope (global or service name)
  - `ListSecrets`: Return keys only (no values for security)
  - `UpdateSecret`: Re-encrypt new value, trigger redeploy
  - `DeleteSecret`: Delete secret, trigger redeploy
- Create `internal/api/handlers/webhooks.go`:
  - `HandleGitHubWebhook`: Verify HMAC signature, parse payload, dispatch events
  - Handle PR opened: Create environment, start workflow
  - Handle PR synchronized (new commits): Trigger rebuild
  - Handle PR closed: Terminate environment
- Add JWT library to `go.mod`:
  - `github.com/golang-jwt/jwt/v5`
- Add rate limiting to `go.mod`:
  - `github.com/redis/go-redis/v9`

**Dependencies:**

- Phase 0 (database models)
- Phase 1 (cloud provider interface - for project cloud config)

**Testing Strategy:**

- Unit tests for middleware:
  - Auth: Valid token, expired token, invalid signature, missing token
  - RBAC: Owner/admin/member/viewer permissions, non-member access
  - Rate limit: Under limit, over limit, different users
- Integration tests for handlers:
  - Create team → verify database entry
  - List projects → verify team scoping
  - Create secret → verify encryption
  - GitHub webhook → verify event dispatch
- API integration tests using httptest:
  - Full request/response cycle
  - Test all HTTP status codes (200, 201, 400, 401, 403, 404, 429, 500)
- Edge cases: Invalid JSON, missing fields, duplicate slugs, soft-deleted resources

**Estimated Effort:** 24 hours

---

## Phase 3: WebSocket Hub and Agent Communication

**Problem Statement:**
Stagely Agents running on VMs need to maintain persistent connections to Core for receiving commands (BUILD, DEPLOY, TERMINATE) and streaming logs in real-time. HTTP polling is inefficient. Need a bidirectional, low-latency communication channel that handles agent disconnections, reconnections, and concurrent operations.

**Solution Overview:**
Implement WebSocket hub using Gorilla WebSocket library. Create a connection manager that tracks active agents by agent_id. Implement message routing (Core→Agent for commands, Agent→Core for logs/status). Handle agent authentication via JWT tokens passed during WebSocket handshake. Implement automatic cleanup for disconnected agents. Support concurrent message handling with per-agent goroutines.

**Success Criteria:**

- ✅ WebSocket hub managing multiple concurrent connections (1000+)
- ✅ Agent handshake (HELLO message with token validation)
- ✅ Message routing (Core→Agent, Agent→Core)
- ✅ Agent authentication (JWT token verification)
- ✅ Connection lifecycle management (connect, disconnect, reconnect)
- ✅ Per-agent message queues (buffered channels)
- ✅ Graceful shutdown (close all connections cleanly)
- ✅ Heartbeat mechanism (detect dead connections)
- ✅ Database tracking of agent connections (agent_connections table)
- ✅ All WebSocket tests passing
- ✅ Load testing (1000 concurrent agents)

**Implementation Details:**

- Create `internal/websocket/hub.go`:

  ```go
  type Hub struct {
      clients    map[string]*Client // agent_id → Client
      register   chan *Client
      unregister chan *Client
      broadcast  chan Message
      db         *gorm.DB
      mu         sync.RWMutex
  }

  func NewHub(db *gorm.DB) *Hub {
      return &Hub{
          clients:    make(map[string]*Client),
          register:   make(chan *Client, 100),
          unregister: make(chan *Client, 100),
          broadcast:  make(chan Message, 1000),
          db:         db,
      }
  }

  func (h *Hub) Run() {
      for {
          select {
          case client := <-h.register:
              h.registerClient(client)
          case client := <-h.unregister:
              h.unregisterClient(client)
          case message := <-h.broadcast:
              h.broadcastMessage(message)
          }
      }
  }

  func (h *Hub) SendToAgent(agentID string, msg Message) error {
      h.mu.RLock()
      client, ok := h.clients[agentID]
      h.mu.RUnlock()

      if !ok {
          return fmt.Errorf("agent not connected: %s", agentID)
      }

      client.send <- msg
      return nil
  }
  ```

- Create `internal/websocket/client.go`:

  ```go
  type Client struct {
      hub       *Hub
      conn      *websocket.Conn
      agentID   string
      environmentID string
      send      chan Message
      done      chan struct{}
  }

  func (c *Client) ReadPump() {
      defer func() {
          c.hub.unregister <- c
          c.conn.Close()
      }()

      c.conn.SetReadDeadline(time.Now().Add(pongWait))
      c.conn.SetPongHandler(func(string) error {
          c.conn.SetReadDeadline(time.Now().Add(pongWait))
          return nil
      })

      for {
          var msg Message
          if err := c.conn.ReadJSON(&msg); err != nil {
              break
          }
          c.handleMessage(msg)
      }
  }

  func (c *Client) WritePump() {
      ticker := time.NewTicker(pingPeriod)
      defer func() {
          ticker.Stop()
          c.conn.Close()
      }()

      for {
          select {
          case msg := <-c.send:
              if err := c.conn.WriteJSON(msg); err != nil {
                  return
              }
          case <-ticker.C:
              if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                  return
              }
          case <-c.done:
              return
          }
      }
  }
  ```

- Create `internal/websocket/messages.go`:

  ```go
  type MessageType string

  const (
      MessageTypeHello      MessageType = "HELLO"
      MessageTypeHelloAck   MessageType = "HELLO_ACK"
      MessageTypeBuild      MessageType = "BUILD"
      MessageTypeDeploy     MessageType = "DEPLOY"
      MessageTypeTerminate  MessageType = "TERMINATE"
      MessageTypeLog        MessageType = "LOG"
      MessageTypeStatus     MessageType = "STATUS"
      MessageTypeHeartbeat  MessageType = "HEARTBEAT"
      MessageTypeError      MessageType = "ERROR"
  )

  type Message struct {
      Type    MessageType     `json:"type"`
      Payload json.RawMessage `json:"payload,omitempty"`
  }

  type HelloMessage struct {
      AgentID      string                 `json:"agent_id"`
      Token        string                 `json:"token"`
      EnvironmentID string                `json:"environment_id"`
      Version      string                 `json:"version"`
      SystemInfo   map[string]interface{} `json:"system_info"`
  }

  type DeployMessage struct {
      JobID      string            `json:"job_id"`
      Image      string            `json:"image"`
      Secrets    []Secret          `json:"secrets"`
      Lifecycle  map[string][]Hook `json:"lifecycle"`
  }

  type LogMessage struct {
      JobID     string    `json:"job_id"`
      Stream    string    `json:"stream"` // "stdout" or "stderr"
      Timestamp time.Time `json:"timestamp"`
      Data      string    `json:"data"`
  }

  type StatusMessage struct {
      JobID           string              `json:"job_id"`
      State           string              `json:"state"`
      ExitCode        int                 `json:"exit_code,omitempty"`
      DurationSeconds float64             `json:"duration_seconds,omitempty"`
      Services        []ServiceStatus     `json:"services,omitempty"`
  }
  ```

- Create `internal/api/handlers/agent.go`:

  ```go
  func HandleAgentConnect(hub *Hub) gin.HandlerFunc {
      return func(c *gin.Context) {
          // Upgrade HTTP to WebSocket
          conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
          if err != nil {
              return
          }

          // Wait for HELLO message
          var helloMsg HelloMessage
          if err := conn.ReadJSON(&helloMsg); err != nil {
              conn.Close()
              return
          }

          // Validate token
          claims, err := validateAgentToken(helloMsg.Token)
          if err != nil {
              conn.WriteJSON(Message{Type: "ERROR", Payload: ...})
              conn.Close()
              return
          }

          // Create client
          client := &Client{
              hub:           hub,
              conn:          conn,
              agentID:       helloMsg.AgentID,
              environmentID: helloMsg.EnvironmentID,
              send:          make(chan Message, 256),
              done:          make(chan struct{}),
          }

          // Register with hub
          hub.register <- client

          // Send HELLO_ACK
          conn.WriteJSON(Message{Type: "HELLO_ACK", ...})

          // Start pumps
          go client.WritePump()
          client.ReadPump() // Blocks until disconnect
      }
  }
  ```

- Update database tracking:
  - Insert into `agent_connections` on HELLO
  - Update `last_seen_at` on HEARTBEAT
  - Mark disconnected on cleanup
- Add WebSocket dependency to `go.mod`:
  - `github.com/gorilla/websocket`

**Dependencies:**

- Phase 0 (database models)
- Phase 2 (JWT authentication)

**Testing Strategy:**

- Unit tests for message serialization/deserialization
- Unit tests for hub registration/unregistration
- Integration tests for WebSocket handshake:
  - Valid token → connection accepted
  - Invalid token → connection rejected
  - Missing token → connection rejected
- Integration tests for message routing:
  - Core sends BUILD → Agent receives
  - Agent sends LOG → Core receives
  - Agent sends STATUS → Core receives
- Load tests:
  - 1000 concurrent agents
  - Measure message latency (p50, p95, p99)
  - Test disconnection handling (random disconnects)
- Edge cases: Malformed JSON, unknown message types, agent double-connection, heartbeat timeout

**Estimated Effort:** 20 hours

---

## Phase 4: Build Pipeline Orchestration (Fan-Out/Fan-In)

**Problem Statement:**
Stagely needs to build Docker images for multiple services in parallel (monorepo support) and handle multi-architecture builds (AMD64 + ARM64). After all builds complete, the system must synchronize (fan-in) before provisioning the preview environment. Builds run on ephemeral high-CPU VMs that must be created, tracked, and terminated automatically.

**Solution Overview:**
Implement workflow orchestrator that parses stagely.yaml, creates workflow_run and build_job records, provisions Builder VMs via cloud provider interface, sends BUILD messages to agents via WebSocket, tracks job completion, implements fan-in synchronization (wait for all jobs), handles multi-arch manifest merging, and provisions Preview VM after all builds succeed.

**Success Criteria:**

- ✅ Parse stagely.yaml (builds section) from GitHub repo
- ✅ Create workflow_run record (status: pending)
- ✅ Generate build_jobs for each build target (fan-out)
- ✅ Provision Builder VMs (one per job)
- ✅ Send BUILD messages to agents with full context
- ✅ Track build job status in database
- ✅ Stream build logs to database (build_logs table)
- ✅ Implement fan-in: Wait for all jobs to complete
- ✅ Handle build failures (mark workflow as failed, terminate VMs)
- ✅ Merge multi-arch images (docker buildx imagetools create)
- ✅ Provision Preview VM after successful builds
- ✅ Terminate Builder VMs after job completion
- ✅ All orchestration tests passing

**Implementation Details:**

- Create `internal/workflow/orchestrator.go`:

  ```go
  type Orchestrator struct {
      db       *gorm.DB
      hub      *websocket.Hub
      providers map[string]providers.CloudProvider
  }

  func (o *Orchestrator) HandlePROpened(pr PullRequest) error {
      // 1. Parse stagely.yaml from repo
      config, err := o.fetchStagelyConfig(pr.RepoURL, pr.CommitHash)
      if err != nil {
          return err
      }

      // 2. Create environment record
      env := models.Environment{
          ProjectID:     pr.ProjectID,
          PRNumber:      pr.Number,
          BranchName:    pr.BranchName,
          CommitHash:    pr.CommitHash,
          SubdomainHash: generateSubdomainHash(),
          Status:        "pending",
      }
      o.db.Create(&env)

      // 3. Create workflow run
      workflowRun := models.WorkflowRun{
          EnvironmentID: env.ID,
          Trigger:       "pr_opened",
          Status:        "pending",
      }
      o.db.Create(&workflowRun)

      // 4. Fan-out: Create build jobs
      var jobs []models.BuildJob
      for name, buildSpec := range config.Builds {
          // Handle multi-arch
          platforms := buildSpec.Platforms
          if len(platforms) == 0 {
              platforms = []string{buildSpec.Platform}
          }

          for _, platform := range platforms {
              arch := extractArch(platform) // "linux/amd64" → "amd64"
              job := models.BuildJob{
                  WorkflowRunID: workflowRun.ID,
                  Name:          fmt.Sprintf("%s_%s", name, arch),
                  Architecture:  arch,
                  ContextPath:   buildSpec.Context,
                  DockerfilePath: buildSpec.Dockerfile,
                  Status:        "queued",
              }
              o.db.Create(&job)
              jobs = append(jobs, job)
          }
      }

      // 5. Provision Builder VMs
      for _, job := range jobs {
          go o.provisionBuilder(job, pr, config)
      }

      // 6. Monitor for completion
      go o.monitorWorkflowRun(workflowRun.ID)

      return nil
  }

  func (o *Orchestrator) provisionBuilder(job models.BuildJob, pr PullRequest, config StagelyConfig) {
      // Update status
      o.db.Model(&job).Update("status", "provisioning")

      // Select provider
      provider := o.providers[pr.Project.CloudProviderID]

      // Provision VM
      vmID, vmIP, err := provider.CreateInstance(context.Background(), providers.InstanceSpec{
          Size:         config.Builds[job.Name].Machine,
          Architecture: job.Architecture,
          UserData:     o.generateBuildScript(job, pr),
          Tags: map[string]string{
              "stagely_job_id": job.ID,
              "stagely_type":   "builder",
          },
      })
      if err != nil {
          o.db.Model(&job).Updates(map[string]interface{}{
              "status":        "failed",
              "error_message": err.Error(),
          })
          return
      }

      // Update job with VM info
      o.db.Model(&job).Updates(map[string]interface{}{
          "status": "provisioning",
          "vm_id":  vmID,
      })
  }

  func (o *Orchestrator) monitorWorkflowRun(workflowRunID string) {
      ticker := time.NewTicker(5 * time.Second)
      defer ticker.Stop()

      for range ticker.C {
          var jobs []models.BuildJob
          o.db.Where("workflow_run_id = ?", workflowRunID).Find(&jobs)

          allDone := true
          anyFailed := false

          for _, job := range jobs {
              if job.Status != "completed" && job.Status != "failed" {
                  allDone = false
                  break
              }
              if job.Status == "failed" {
                  anyFailed = true
              }
          }

          if !allDone {
              continue
          }

          // Fan-in complete
          if anyFailed {
              o.db.Model(&models.WorkflowRun{}).
                  Where("id = ?", workflowRunID).
                  Update("status", "failed")
              o.cleanupBuilders(workflowRunID)
              return
          }

          // All builds succeeded
          o.db.Model(&models.WorkflowRun{}).
              Where("id = ?", workflowRunID).
              Update("status", "deploying")

          // Merge multi-arch images if needed
          o.mergeMultiArchImages(workflowRunID)

          // Provision Preview VM
          o.provisionPreview(workflowRunID)

          // Cleanup builders
          o.cleanupBuilders(workflowRunID)

          return
      }
  }
  ```

- Create `internal/workflow/builder.go`:

  ```go
  func (o *Orchestrator) generateBuildScript(job models.BuildJob, pr PullRequest) string {
      return fmt.Sprintf(`#!/bin/bash
  set -e

  # Install Agent
  curl -fsSL https://get.stagely.dev/agent/latest/linux-%s -o /usr/local/bin/stagely-agent
  chmod +x /usr/local/bin/stagely-agent

  # Configure Agent
  cat > /etc/stagely/config.json <<EOF
  {
    "agent_id": "builder_%s",
    "token": "%s",
    "core_url": "wss://api.stagely.dev/v1/agent/connect",
    "job_id": "%s"
  }
  EOF

  # Start Agent
  systemctl enable --now stagely-agent
  `, job.Architecture, job.ID[:8], generateAgentToken(job.ID), job.ID)
  }
  ```

- Create `internal/workflow/parser.go`:

  ```go
  type StagelyConfig struct {
      Version string                 `yaml:"version"`
      Builds  map[string]BuildSpec   `yaml:"builds"`
      Preview PreviewSpec            `yaml:"preview"`
      Test    TestSpec               `yaml:"test"`
  }

  type BuildSpec struct {
      Context    string            `yaml:"context"`
      Dockerfile string            `yaml:"dockerfile"`
      Platform   string            `yaml:"platform"`
      Platforms  []string          `yaml:"platforms"`
      Machine    string            `yaml:"machine"`
      BuildArgs  map[string]string `yaml:"build_args"`
      CacheFrom  []string          `yaml:"cache_from"`
      Timeout    string            `yaml:"timeout"`
  }

  func (o *Orchestrator) fetchStagelyConfig(repoURL, commitHash string) (*StagelyConfig, error) {
      // Clone repo (shallow)
      tmpDir := "/tmp/stagely-" + commitHash[:8]
      cmd := exec.Command("git", "clone", "--depth", "1", repoURL, tmpDir)
      if err := cmd.Run(); err != nil {
          return nil, err
      }
      defer os.RemoveAll(tmpDir)

      // Checkout commit
      cmd = exec.Command("git", "-C", tmpDir, "checkout", commitHash)
      if err := cmd.Run(); err != nil {
          return nil, err
      }

      // Parse stagely.yaml
      data, err := os.ReadFile(filepath.Join(tmpDir, "stagely.yaml"))
      if err != nil {
          return nil, err
      }

      var config StagelyConfig
      if err := yaml.Unmarshal(data, &config); err != nil {
          return nil, err
      }

      return &config, nil
  }
  ```

- Handle Agent BUILD messages:
  - Agent sends STATUS: completed → Update build_job.status = "completed"
  - Agent sends STATUS: failed → Update build_job.status = "failed"
  - Agent sends LOG → Insert into build_logs table
- Multi-arch merge:
  - Find all build jobs with same base name but different architectures
  - Run `docker buildx imagetools create` to merge manifests
  - Store merged image URL as final artifact

**Dependencies:**

- Phase 0 (database models)
- Phase 1 (cloud provider interface)
- Phase 3 (WebSocket agent communication)

**Testing Strategy:**

- Unit tests for stagely.yaml parsing (valid, invalid, missing fields)
- Unit tests for build job generation (single-arch, multi-arch, monorepo)
- Integration tests for workflow lifecycle:
  - Create workflow → builds queued → VMs provisioned → builds complete → fan-in
  - Test failure handling (one build fails → workflow fails)
  - Test multi-arch merge (amd64 + arm64 → single manifest)
- Mock cloud provider and WebSocket hub for faster tests
- Edge cases: Invalid stagely.yaml, git clone failures, all builds fail, partial build success

**Estimated Effort:** 24 hours

---

## Phase 5: Environment Deployment and Lifecycle

**Problem Statement:**
After builds complete, Stagely must provision a Preview VM in the user's cloud account, install the Agent, send deployment configuration (image URLs, secrets, lifecycle hooks), generate docker-compose override files, start containers, verify health, and update routing table (Redis) for the Edge Proxy. Must handle deployment failures, redeployments (secret updates), and environment termination (PR closed).

**Solution Overview:**
Implement preview provisioner that creates VMs with larger specs than builders, generates Agent Cloud-Init with deployment context, sends DEPLOY message via WebSocket with secrets and image URLs, waits for Agent to report container health, updates Redis routing table with environment subdomain → VM IP mapping, handles lifecycle hooks (on_start commands), and implements termination workflow (stop containers, delete VM, remove Redis route).

**Success Criteria:**

- ✅ Provision Preview VM (appropriate size based on stagely.yaml)
- ✅ Install Agent on Preview VM via Cloud-Init
- ✅ Send DEPLOY message with image, secrets, lifecycle hooks
- ✅ Agent generates docker-compose.stagely.yml override
- ✅ Agent runs `docker compose up -d`
- ✅ Agent executes lifecycle hooks (on_start commands)
- ✅ Agent reports container health (all services running)
- ✅ Update Redis: `route:{hash}` → `{ip, port, status: "ready"}`
- ✅ Update environment status to "ready"
- ✅ Handle deployment failures (rollback, mark as failed)
- ✅ Handle redeployment (secret update triggers redeploy)
- ✅ Handle termination (PR closed → delete VM, remove Redis route)
- ✅ All deployment tests passing

**Implementation Details:**

- Create `internal/workflow/preview.go`:

  ```go
  func (o *Orchestrator) provisionPreview(workflowRunID string) error {
      var workflowRun models.WorkflowRun
      o.db.Preload("Environment.Project").First(&workflowRun, "id = ?", workflowRunID)

      env := workflowRun.Environment
      project := env.Project

      // Fetch stagely.yaml for preview size
      config, _ := o.fetchStagelyConfig(project.RepoURL, env.CommitHash)
      previewSize := config.Preview.Size
      if previewSize == "" {
          previewSize = "medium"
      }

      // Select provider
      provider := o.providers[project.CloudProviderID]

      // Provision VM
      vmID, vmIP, err := provider.CreateInstance(context.Background(), providers.InstanceSpec{
          Size:         previewSize,
          Architecture: "amd64", // Preview VMs always amd64 (agents pull multi-arch)
          UserData:     o.generatePreviewScript(env, workflowRun),
          Tags: map[string]string{
              "stagely_environment_id": env.ID,
              "stagely_type":           "preview",
          },
      })
      if err != nil {
          return err
      }

      // Update environment
      o.db.Model(&env).Updates(map[string]interface{}{
          "vm_id":     vmID,
          "vm_ip":     vmIP,
          "vm_status": "provisioning",
          "status":    "deploying",
      })

      return nil
  }

  func (o *Orchestrator) generatePreviewScript(env models.Environment, run models.WorkflowRun) string {
      return fmt.Sprintf(`#!/bin/bash
  set -e

  # Install Docker
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker

  # Install Docker Compose
  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose

  # Install Agent
  curl -fsSL https://get.stagely.dev/agent/latest/linux-amd64 -o /usr/local/bin/stagely-agent
  chmod +x /usr/local/bin/stagely-agent

  # Configure Agent
  mkdir -p /etc/stagely
  cat > /etc/stagely/config.json <<EOF
  {
    "agent_id": "preview_%s",
    "token": "%s",
    "core_url": "wss://api.stagely.dev/v1/agent/connect",
    "environment_id": "%s"
  }
  EOF

  # Create systemd service
  cat > /etc/systemd/system/stagely-agent.service <<EOF
  [Unit]
  Description=Stagely Agent
  After=network.target docker.service

  [Service]
  Type=simple
  ExecStart=/usr/local/bin/stagely-agent
  Restart=always
  RestartSec=5

  [Install]
  WantedBy=multi-user.target
  EOF

  # Start Agent
  systemctl daemon-reload
  systemctl enable --now stagely-agent
  `, env.ID[:8], generateAgentToken(env.ID), env.ID)
  }

  func (o *Orchestrator) handleAgentConnected(agentID, environmentID string) {
      // Load environment
      var env models.Environment
      o.db.Preload("Project").First(&env, "id = ?", environmentID)

      // Load secrets
      var secrets []models.Secret
      o.db.Where("project_id = ?", env.ProjectID).Find(&secrets)

      // Decrypt secrets
      decryptedSecrets := make([]Secret, 0, len(secrets))
      for _, s := range secrets {
          value, _ := decrypt(s.EncryptedValue)
          decryptedSecrets = append(decryptedSecrets, Secret{
              Key:   s.Key,
              Value: value,
              Scope: s.Scope,
              Type:  s.SecretType,
          })
      }

      // Get final image URLs from build jobs
      var workflowRun models.WorkflowRun
      o.db.Preload("BuildJobs").Where("environment_id = ?", environmentID).
          Order("created_at DESC").First(&workflowRun)

      imageURL := workflowRun.BuildJobs[0].ArtifactURL // Simplified

      // Send DEPLOY message
      deployMsg := websocket.Message{
          Type: websocket.MessageTypeDeploy,
          Payload: DeployPayload{
              JobID:   "deploy_" + environmentID,
              Image:   imageURL,
              Secrets: decryptedSecrets,
              Lifecycle: map[string][]Hook{
                  "on_start": {
                      {Service: "backend", Command: "npm run db:migrate"},
                  },
              },
          },
      }

      o.hub.SendToAgent(agentID, deployMsg)
  }

  func (o *Orchestrator) handleDeploymentComplete(environmentID string, status StatusMessage) {
      if status.State == "failed" {
          // Mark as failed
          o.db.Model(&models.Environment{}).
              Where("id = ?", environmentID).
              Update("status", "failed")
          return
      }

      // Load environment
      var env models.Environment
      o.db.First(&env, "id = ?", environmentID)

      // Find exposed port (first service with port)
      port := 3000 // Default
      if len(status.Services) > 0 {
          port = status.Services[0].Port
      }

      // Update Redis routing
      o.redis.Set(context.Background(), "route:"+env.SubdomainHash, map[string]interface{}{
          "ip":             env.VMIP,
          "port":           port,
          "status":         "ready",
          "project":        env.Project.Slug,
          "environment_id": env.ID,
      }, 1*time.Hour)

      // Update environment status
      o.db.Model(&env).Updates(map[string]interface{}{
          "status":      "ready",
          "deployed_at": time.Now(),
      })

      // Post GitHub comment
      o.postGitHubComment(env, fmt.Sprintf("✅ Preview ready: https://%s.stagely.dev", env.SubdomainHash))
  }
  ```

- Create `internal/workflow/terminator.go`:

  ```go
  func (o *Orchestrator) HandlePRClosed(pr PullRequest) error {
      // Find environment
      var env models.Environment
      o.db.Where("project_id = ? AND pr_number = ?", pr.ProjectID, pr.Number).
          First(&env)

      if env.ID == "" {
          return nil // Already terminated
      }

      // Send TERMINATE to agent (if connected)
      o.hub.SendToAgent("preview_"+env.ID[:8], websocket.Message{
          Type: websocket.MessageTypeTerminate,
          Payload: TerminatePayload{
              Reason:              "pr_closed",
              GracePeriodSeconds:  30,
          },
      })

      // Wait for agent to stop containers
      time.Sleep(30 * time.Second)

      // Terminate VM
      provider := o.providers[env.Project.CloudProviderID]
      provider.TerminateInstance(context.Background(), env.VMID)

      // Remove from Redis
      o.redis.Del(context.Background(), "route:"+env.SubdomainHash)

      // Update database
      o.db.Model(&env).Updates(map[string]interface{}{
          "status":        "terminated",
          "terminated_at": time.Now(),
      })

      // Post GitHub comment
      o.postGitHubComment(env, "Environment terminated")

      return nil
  }
  ```

- Agent deployment logic (documented, not implemented in Core):
  - Agent receives DEPLOY message
  - Agent generates docker-compose.stagely.yml with secrets
  - Agent runs: `docker compose -f docker-compose.yml -f docker-compose.stagely.yml up -d`
  - Agent waits 5 seconds
  - Agent runs lifecycle hooks: `docker compose exec {service} {command}`
  - Agent checks health: `docker compose ps --format json`
  - Agent sends STATUS: completed or failed

**Dependencies:**

- Phase 0 (database models, encryption)
- Phase 1 (cloud provider interface)
- Phase 3 (WebSocket agent communication)
- Phase 4 (workflow orchestration)

**Testing Strategy:**

- Unit tests for preview script generation
- Unit tests for Redis routing updates
- Integration tests for full deployment:
  - Provision VM → Agent connects → DEPLOY sent → STATUS received → Redis updated
  - Test deployment failure (unhealthy containers → status failed)
  - Test redeployment (update secret → redeploy triggered)
  - Test termination (PR closed → VM deleted, Redis cleared)
- Mock cloud provider for faster tests
- Edge cases: Agent never connects (timeout), containers crash immediately, lifecycle hook fails

**Estimated Effort:** 16 hours

---

## Phase 6: Secrets Management and Injection

**Problem Statement:**
Users need to store sensitive environment variables (API keys, database URLs) and files (SSL certs, service account JSONs) that are injected into preview environments. Secrets must be encrypted at rest, scoped to specific services (global vs backend-only), never logged in plaintext, and automatically injected without modifying user code. Secret updates must trigger redeployments.

**Solution Overview:**
Implement secrets CRUD handlers (already in Phase 2) with AES-256-GCM encryption. Build secret scoping logic (global vs service-specific). Implement secret masking for logs (replace values with **_REDACTED_**). Build docker-compose override generation logic in Agent (documented). Implement redeploy trigger on secret update. Handle file secrets (write to disk before docker-compose up).

**Success Criteria:**

- ✅ Create secret: Encrypt value before storing in database
- ✅ Update secret: Re-encrypt new value, trigger redeploy
- ✅ Delete secret: Remove from database, trigger redeploy
- ✅ List secrets: Return keys only (no values)
- ✅ Secret scoping: Global secrets → all services, scoped → specific service
- ✅ Secret masking: Replace secret values in logs with **_REDACTED_**
- ✅ File secrets: Write to disk with proper permissions
- ✅ Override generation: Create docker-compose.stagely.yml with environment vars
- ✅ Redeploy on secret change: Send new DEPLOY message to agent
- ✅ All secret tests passing (encryption, scoping, masking)

**Implementation Details:**

- Encryption already implemented in Phase 0 (`internal/crypto/encrypt.go`)
- Secret handlers already implemented in Phase 2 (`internal/api/handlers/secrets.go`)
- Create `internal/crypto/mask.go`:

  ```go
  type SecretMasker struct {
      secrets []string
      mu      sync.RWMutex
  }

  func NewSecretMasker(secrets []models.Secret) *SecretMasker {
      values := make([]string, 0, len(secrets))
      for _, s := range secrets {
          decrypted, _ := Decrypt(s.EncryptedValue)
          if len(decrypted) > 0 {
              values = append(values, decrypted)
          }
      }
      return &SecretMasker{secrets: values}
  }

  func (m *SecretMasker) Mask(logLine string) string {
      m.mu.RLock()
      defer m.mu.RUnlock()

      masked := logLine
      for _, secret := range m.secrets {
          masked = strings.ReplaceAll(masked, secret, "***REDACTED***")
      }
      return masked
  }
  ```

- Update `internal/workflow/preview.go` to use masker:

  ```go
  func (o *Orchestrator) handleAgentLog(log LogMessage) {
      // Load secrets for masking
      var env models.Environment
      o.db.Preload("Project").
          Joins("JOIN agent_connections ON agent_connections.environment_id = environments.id").
          Where("agent_connections.agent_id = ?", log.AgentID).
          First(&env)

      var secrets []models.Secret
      o.db.Where("project_id = ?", env.ProjectID).Find(&secrets)

      // Mask secrets
      masker := crypto.NewSecretMasker(secrets)
      maskedLine := masker.Mask(log.Data)

      // Store in database
      o.db.Create(&models.BuildLog{
          BuildJobID: log.JobID,
          Stream:     log.Stream,
          Line:       maskedLine,
      })
  }
  ```

- Implement redeploy trigger:

  ```go
  func (h *SecretHandler) UpdateSecret(c *gin.Context) {
      secretID := c.Param("secret_id")

      var req UpdateSecretRequest
      if err := c.ShouldBindJSON(&req); err != nil {
          c.JSON(400, gin.H{"error": err.Error()})
          return
      }

      // Encrypt new value
      encrypted, _ := crypto.Encrypt(req.Value)

      // Update in database
      h.db.Model(&models.Secret{}).
          Where("id = ?", secretID).
          Update("encrypted_value", encrypted)

      // Trigger redeploy
      var secret models.Secret
      h.db.Preload("Project").First(&secret, "id = ?", secretID)

      // Find active environments for this project
      var envs []models.Environment
      h.db.Where("project_id = ? AND status = ?", secret.ProjectID, "ready").
          Find(&envs)

      for _, env := range envs {
          h.orchestrator.TriggerRedeploy(env.ID, "secret_updated")
      }

      c.JSON(200, gin.H{"status": "updated"})
  }
  ```

- Agent override generation (documented, not implemented in Core):
  ```yaml
  # docker-compose.stagely.yml (generated by Agent)
  version: "3"
  services:
    backend:
      environment:
        - DATABASE_URL=postgres://... # global secret
        - PORT=8080 # backend-scoped
        - STRIPE_KEY=sk_... # backend-scoped
    frontend:
      environment:
        - DATABASE_URL=postgres://... # global secret
        - PORT=3000 # frontend-scoped
        - API_URL=https://... # frontend-scoped
  ```
- File secrets handling (documented, not in Core):
  - Agent writes file secrets to disk before `docker compose up`
  - Agent sets file permissions (e.g., 0600 for private keys)
  - Agent deletes files on termination

**Dependencies:**

- Phase 0 (encryption utilities)
- Phase 2 (secret handlers)
- Phase 3 (WebSocket communication)
- Phase 5 (deployment logic)

**Testing Strategy:**

- Unit tests for encryption/decryption (round-trip, tamper detection)
- Unit tests for secret masking:
  - Plain text with secret → masked
  - JSON with secret → masked
  - Multiple secrets in one line → all masked
  - Secret in binary data → not masked (edge case)
- Integration tests for secret lifecycle:
  - Create → verify encrypted in database
  - Update → verify redeployment triggered
  - Delete → verify removed, redeploy triggered
- Integration tests for scoping:
  - Global secret → appears in all services
  - Scoped secret → appears only in target service
- Edge cases: Empty secret value, special characters in secrets, very long secrets (>1KB)

**Estimated Effort:** 16 hours

---

## Phase 7: Environment Monitoring and Reaper

**Problem Statement:**
Preview environments can become stale if the Agent disconnects (VM crash, network issue) or if environments run too long (cost control). Need automatic detection and cleanup of stale resources: disconnected agents (>15min), environments exceeding TTL (24h default), and orphaned VMs (VM exists but environment deleted).

**Solution Overview:**
Implement background reaper goroutine that runs every 5 minutes, queries database for stale environments (last_heartbeat_at old, created_at old), terminates VMs via cloud provider API, removes Redis routes, updates environment status to "reaped". Implement agent heartbeat mechanism (agents send HEARTBEAT every 30s, Core updates last_heartbeat_at). Add Prometheus metrics for monitoring.

**Success Criteria:**

- ✅ Agent heartbeat: Agents send HEARTBEAT every 30 seconds
- ✅ Core updates environment.last_heartbeat_at on HEARTBEAT
- ✅ Reaper goroutine runs every 5 minutes
- ✅ Detect stale environments: last_heartbeat_at > 15 minutes old
- ✅ Detect TTL-expired environments: created_at > 24 hours old
- ✅ Terminate VMs for stale/expired environments
- ✅ Remove Redis routes for reaped environments
- ✅ Update environment status to "reaped"
- ✅ Prometheus metrics: active_environments, reaped_environments_total
- ✅ All reaper tests passing

**Implementation Details:**

- Update agent heartbeat handling in `internal/websocket/client.go`:

  ```go
  func (c *Client) handleHeartbeat(msg HeartbeatMessage) {
      // Update last_heartbeat_at
      c.hub.db.Model(&models.Environment{}).
          Where("id = ?", c.environmentID).
          Update("last_heartbeat_at", time.Now())

      // Extend Redis TTL
      c.hub.redis.Expire(context.Background(), "route:"+c.environmentHash, 1*time.Hour)

      // Send ACK
      c.send <- websocket.Message{Type: websocket.MessageTypeHeartbeatAck}
  }
  ```

- Create `internal/workflow/reaper.go`:

  ```go
  type Reaper struct {
      db        *gorm.DB
      redis     *redis.Client
      providers map[string]providers.CloudProvider
  }

  func (r *Reaper) Start() {
      ticker := time.NewTicker(5 * time.Minute)
      defer ticker.Stop()

      for range ticker.C {
          r.reapStaleEnvironments()
      }
  }

  func (r *Reaper) reapStaleEnvironments() {
      var staleEnvs []models.Environment

      // Find stale environments
      r.db.Preload("Project").
          Where("status = ? AND (last_heartbeat_at < ? OR created_at < ?)",
              "ready",
              time.Now().Add(-15*time.Minute),
              time.Now().Add(-24*time.Hour),
          ).
          Find(&staleEnvs)

      log.Info("found stale environments", "count", len(staleEnvs))

      for _, env := range staleEnvs {
          log.Info("reaping environment",
              "environment_id", env.ID,
              "last_heartbeat", env.LastHeartbeatAt,
              "age_hours", time.Since(env.CreatedAt).Hours(),
          )

          r.reapEnvironment(env)
      }
  }

  func (r *Reaper) reapEnvironment(env models.Environment) {
      // Terminate VM
      provider := r.providers[env.Project.CloudProviderID]
      if err := provider.TerminateInstance(context.Background(), env.VMID); err != nil {
          log.Error("failed to terminate VM", "error", err, "vm_id", env.VMID)
      }

      // Remove from Redis
      r.redis.Del(context.Background(), "route:"+env.SubdomainHash)

      // Update database
      r.db.Model(&env).Updates(map[string]interface{}{
          "status":        "reaped",
          "terminated_at": time.Now(),
      })

      // Metrics
      reapedEnvironmentsTotal.Inc()
  }
  ```

- Add Prometheus metrics in `internal/metrics/metrics.go`:

  ```go
  var (
      activeEnvironments = prometheus.NewGauge(prometheus.GaugeOpts{
          Name: "stagely_active_environments",
          Help: "Number of currently active preview environments",
      })

      reapedEnvironmentsTotal = prometheus.NewCounter(prometheus.CounterOpts{
          Name: "stagely_reaped_environments_total",
          Help: "Total number of reaped environments",
      })

      buildQueueDepth = prometheus.NewGauge(prometheus.GaugeOpts{
          Name: "stagely_build_queue_depth",
          Help: "Number of builds waiting in queue",
      })
  )

  func init() {
      prometheus.MustRegister(activeEnvironments)
      prometheus.MustRegister(reapedEnvironmentsTotal)
      prometheus.MustRegister(buildQueueDepth)
  }

  func UpdateMetrics(db *gorm.DB) {
      // Active environments
      var count int64
      db.Model(&models.Environment{}).Where("status IN ?", []string{"deploying", "ready"}).Count(&count)
      activeEnvironments.Set(float64(count))

      // Build queue
      var queueCount int64
      db.Model(&models.BuildJob{}).Where("status = ?", "queued").Count(&queueCount)
      buildQueueDepth.Set(float64(queueCount))
  }
  ```

- Start reaper in `cmd/core/main.go`:

  ```go
  func main() {
      // ... setup ...

      reaper := workflow.NewReaper(db, redisClient, providers)
      go reaper.Start()

      // Start metrics updater
      go func() {
          ticker := time.NewTicker(30 * time.Second)
          for range ticker.C {
              metrics.UpdateMetrics(db)
          }
      }()

      // ... start server ...
  }
  ```

- Expose metrics endpoint:
  ```go
  router.GET("/metrics", gin.WrapH(promhttp.Handler()))
  ```

**Dependencies:**

- Phase 0 (database models)
- Phase 1 (cloud provider interface)
- Phase 3 (WebSocket heartbeat)
- Phase 5 (environment lifecycle)

**Testing Strategy:**

- Unit tests for stale detection logic:
  - last_heartbeat_at = 14 minutes ago → not stale
  - last_heartbeat_at = 16 minutes ago → stale
  - created_at = 23 hours ago → not expired
  - created_at = 25 hours ago → expired
- Integration tests for reaper:
  - Create environment → simulate no heartbeat → wait for reaper → verify reaped
  - Create environment → simulate old created_at → verify reaped
  - Verify VM termination called
  - Verify Redis route removed
- Mock cloud provider and time (time.Now override for testing)
- Edge cases: VM already terminated (idempotent), Redis key already deleted

**Estimated Effort:** 16 hours

---

## Phase 8: Internal Docker Registry Integration

**Problem Statement:**
Built Docker images need intermediate storage between Builder VMs and Preview VMs. Public registries (Docker Hub) have rate limits and security concerns. Need a private, internal Docker registry for storing build artifacts with layer caching for fast rebuilds. Must support multi-arch manifests.

**Solution Overview:**
Deploy Docker Registry v2 as a container. Configure authentication (token-based). Implement registry client in Go using distribution/distribution library. Handle image push from Builder Agents (agent pushes after build). Handle image pull from Preview Agents (agent pulls before deploy). Implement multi-arch manifest creation (docker buildx imagetools). Configure S3-compatible storage backend for persistence.

**Success Criteria:**

- ✅ Docker Registry v2 deployed and running
- ✅ Registry accessible from Core (internal network only)
- ✅ Token-based authentication configured
- ✅ Registry client in Go (push, pull, manifest inspection)
- ✅ Builder agents can push images to registry
- ✅ Preview agents can pull images from registry
- ✅ Multi-arch manifest merging working
- ✅ Layer caching enabled (cache-from/cache-to in buildx)
- ✅ S3 storage backend configured (persistence)
- ✅ All registry integration tests passing

**Implementation Details:**

- Add Docker Registry to `docker-compose.yml`:
  ```yaml
  registry:
    image: registry:2
    ports:
      - "5000:5000"
    environment:
      REGISTRY_STORAGE_FILESYSTEM_ROOTDIRECTORY: /var/lib/registry
      REGISTRY_AUTH: token
      REGISTRY_AUTH_TOKEN_REALM: https://api.stagely.dev/v1/registry/auth
      REGISTRY_AUTH_TOKEN_SERVICE: registry.stagely.internal
      REGISTRY_AUTH_TOKEN_ISSUER: stagely-core
    volumes:
      - registry_data:/var/lib/registry
  ```
- Create `internal/registry/client.go`:

  ```go
  type Client struct {
      baseURL  string
      username string
      password string
      client   *http.Client
  }

  func NewClient(url, username, password string) *Client {
      return &Client{
          baseURL:  url,
          username: username,
          password: password,
          client:   &http.Client{Timeout: 30 * time.Second},
      }
  }

  func (c *Client) Push(ctx context.Context, image string, reader io.Reader) error {
      // Implementation using distribution/distribution library
      // Or shell out to `docker push`
  }

  func (c *Client) Pull(ctx context.Context, image string, writer io.Writer) error {
      // Implementation
  }

  func (c *Client) InspectManifest(ctx context.Context, image string) (*Manifest, error) {
      // GET /v2/{name}/manifests/{reference}
  }
  ```

- Create `internal/registry/manifest.go`:
  ```go
  func (c *Client) CreateMultiArchManifest(ctx context.Context, target string, sources []string) error {
      // Use docker buildx imagetools create
      cmd := exec.CommandContext(ctx, "docker", "buildx", "imagetools", "create",
          "-t", target,
          sources...,
      )
      return cmd.Run()
  }
  ```
- Update Builder Agent script to push to registry:

  ```bash
  # In Cloud-Init for Builder VM
  echo "${REGISTRY_PASSWORD}" | docker login registry.stagely.internal -u stagely --password-stdin

  docker buildx build \
    --platform linux/amd64 \
    --cache-from=type=registry,ref=registry.stagely.internal/proj-123/cache:backend \
    --cache-to=type=registry,ref=registry.stagely.internal/proj-123/cache:backend,mode=max \
    -t registry.stagely.internal/proj-123/env-456:backend-amd64 \
    --push \
    ./api
  ```

- Update Preview Agent script to pull from registry:

  ```bash
  # In Cloud-Init for Preview VM
  echo "${REGISTRY_PASSWORD}" | docker login registry.stagely.internal -u stagely --password-stdin

  docker pull registry.stagely.internal/proj-123/env-456:backend
  ```

- Configure S3 storage (production):
  ```yaml
  environment:
    REGISTRY_STORAGE: s3
    REGISTRY_STORAGE_S3_BUCKET: stagely-registry
    REGISTRY_STORAGE_S3_REGION: us-east-1
    REGISTRY_STORAGE_S3_ACCESSKEY: ${AWS_ACCESS_KEY}
    REGISTRY_STORAGE_S3_SECRETKEY: ${AWS_SECRET_KEY}
  ```

**Dependencies:**

- Phase 0 (basic setup)
- Phase 4 (build orchestration)
- Phase 5 (deployment)

**Testing Strategy:**

- Unit tests for registry client (mock HTTP responses)
- Integration tests with real registry:
  - Push image → verify stored
  - Pull image → verify retrieved
  - Create multi-arch manifest → verify merged
  - Test authentication (valid token, invalid token)
- Test layer caching:
  - Build → rebuild with no changes → verify cache hit (fast build)
  - Build → change one line → verify partial cache hit
- Edge cases: Registry unreachable, disk full, invalid image names

**Estimated Effort:** 12 hours

---

## Phase 9: Observability, Logging, and Audit Trail

**Problem Statement:**
Production system needs comprehensive observability for debugging, compliance, and performance monitoring. Need structured logging (JSON), audit trail for sensitive operations (secret access, environment creation/deletion), request tracing (correlation IDs), and performance metrics (API latency, build duration). Must support log aggregation (ELK, Loki) and metric scraping (Prometheus).

**Solution Overview:**
Implement structured logging using zerolog with request correlation IDs. Implement audit log creation for sensitive operations (secrets CRUD, environment lifecycle, user management). Add request ID middleware (X-Request-ID header). Implement database query logging (slow queries). Add detailed metrics (histograms for latency, counters for errors). Create log rotation policy.

**Success Criteria:**

- ✅ Structured JSON logging throughout application
- ✅ Request correlation IDs (X-Request-ID in all logs)
- ✅ Audit logs for all sensitive operations
- ✅ Audit log API endpoints (list, filter by resource/user)
- ✅ Slow query logging (>100ms)
- ✅ Detailed Prometheus metrics (latency histograms, error rates)
- ✅ Log levels configurable (debug, info, warn, error)
- ✅ Log rotation (max 100MB per file, keep 10 files)
- ✅ All observability tests passing

**Implementation Details:**

- Configure zerolog in `cmd/core/main.go`:

  ```go
  import "github.com/rs/zerolog"

  func main() {
      // Configure logging
      zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

      level := os.Getenv("LOG_LEVEL")
      switch level {
      case "debug":
          zerolog.SetGlobalLevel(zerolog.DebugLevel)
      case "warn":
          zerolog.SetGlobalLevel(zerolog.WarnLevel)
      case "error":
          zerolog.SetGlobalLevel(zerolog.ErrorLevel)
      default:
          zerolog.SetGlobalLevel(zerolog.InfoLevel)
      }

      log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

      // ... rest of setup ...
  }
  ```

- Create request ID middleware in `internal/api/middleware/request_id.go`:

  ```go
  func RequestID() gin.HandlerFunc {
      return func(c *gin.Context) {
          requestID := c.GetHeader("X-Request-ID")
          if requestID == "" {
              requestID = uuid.New().String()
          }

          c.Set("request_id", requestID)
          c.Header("X-Request-ID", requestID)

          // Add to logger context
          logger := log.With().Str("request_id", requestID).Logger()
          c.Set("logger", logger)

          c.Next()
      }
  }
  ```

- Update logger middleware to use request ID:

  ```go
  func Logger() gin.HandlerFunc {
      return func(c *gin.Context) {
          start := time.Now()

          logger, _ := c.Get("logger")
          log := logger.(zerolog.Logger)

          c.Next()

          log.Info().
              Str("method", c.Request.Method).
              Str("path", c.Request.URL.Path).
              Int("status", c.Writer.Status()).
              Dur("duration_ms", time.Since(start)).
              Str("client_ip", c.ClientIP()).
              Msg("request completed")
      }
  }
  ```

- Create audit log helper in `internal/models/audit_log.go`:
  ```go
  func CreateAuditLog(db *gorm.DB, action, resourceType string, resourceID uuid.UUID, actorID uuid.UUID, metadata map[string]interface{}) {
      log := AuditLog{
          ActorID:      actorID,
          Action:       action,
          ResourceType: resourceType,
          ResourceID:   resourceID,
          Metadata:     metadata,
      }
      db.Create(&log)
  }
  ```
- Add audit logging to sensitive operations:

  ```go
  // In secrets handler
  func (h *SecretHandler) CreateSecret(c *gin.Context) {
      // ... create secret ...

      user, _ := c.Get("user")
      models.CreateAuditLog(h.db, "secret.created", "secret", secret.ID, user.ID, map[string]interface{}{
          "project_id": secret.ProjectID,
          "key":        secret.Key,
          "scope":      secret.Scope,
      })
  }

  // In environment handler
  func (h *EnvironmentHandler) DeleteEnvironment(c *gin.Context) {
      // ... delete environment ...

      user, _ := c.Get("user")
      models.CreateAuditLog(h.db, "environment.deleted", "environment", env.ID, user.ID, map[string]interface{}{
          "project_id": env.ProjectID,
          "pr_number":  env.PRNumber,
      })
  }
  ```

- Create audit log API in `internal/api/handlers/audit_logs.go`:

  ```go
  func ListAuditLogs(c *gin.Context) {
      resourceType := c.Query("resource_type")
      resourceID := c.Query("resource_id")
      actorID := c.Query("actor_id")

      query := db.Model(&models.AuditLog{})

      if resourceType != "" {
          query = query.Where("resource_type = ?", resourceType)
      }
      if resourceID != "" {
          query = query.Where("resource_id = ?", resourceID)
      }
      if actorID != "" {
          query = query.Where("actor_id = ?", actorID)
      }

      var logs []models.AuditLog
      query.Order("timestamp DESC").Limit(100).Find(&logs)

      c.JSON(200, logs)
  }
  ```

- Add slow query logging:
  ```go
  // In database setup
  db.Logger = logger.New(
      log.New(os.Stdout, "\r\n", log.LstdFlags),
      logger.Config{
          SlowThreshold: 100 * time.Millisecond,
          LogLevel:      logger.Warn,
          Colorful:      false,
      },
  )
  ```
- Add detailed metrics:

  ```go
  var (
      httpRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
          Name:    "stagely_http_request_duration_seconds",
          Help:    "HTTP request duration",
          Buckets: prometheus.DefBuckets,
      }, []string{"method", "path", "status"})

      httpRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
          Name: "stagely_http_requests_total",
          Help: "Total HTTP requests",
      }, []string{"method", "path", "status"})

      buildDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
          Name:    "stagely_build_duration_seconds",
          Help:    "Build job duration",
          Buckets: []float64{60, 120, 300, 600, 1200, 1800},
      }, []string{"project", "architecture"})
  )
  ```

**Dependencies:**

- Phase 0 (database models)
- Phase 2 (API handlers)
- All other phases (for comprehensive logging)

**Testing Strategy:**

- Unit tests for audit log creation
- Integration tests for audit log API (filter by resource, user, type)
- Test request ID propagation (multiple hops)
- Test log levels (debug→info→warn→error)
- Verify metrics collected (sample HTTP request → verify metric incremented)
- Edge cases: Missing request ID, very long log messages, concurrent audit logs

**Estimated Effort:** 12 hours

---

## Testing Strategy (Overall)

**Unit Tests:**

- Pure functions (encryption, NanoID, config parsing)
- Business logic (phase selection, scoping, masking)
- Coverage goal: 70%+

**Integration Tests:**

- Database operations (GORM models, queries)
- Cloud provider implementations (requires test credentials)
- WebSocket hub (concurrent connections)
- API endpoints (full request/response cycle)
- Use testcontainers for PostgreSQL, Redis

**End-to-End Tests:**

- Full workflow: PR opened → builds → deploy → ready → PR closed
- Mock cloud providers and GitHub for reproducibility
- Verify database state at each step
- Verify Redis routing updates
- Verify agent message flow

**Load Tests:**

- 1000 concurrent WebSocket connections
- 50 parallel builds
- API rate limiting (verify 429 responses)
- Use vegeta or k6 for load testing

**Performance Tests:**

- API response time <100ms (p95)
- Database query time <10ms (p95)
- Redis lookup time <1ms (p95)
- Build provisioning time <60s

---

## Quality Standards

**Code Quality:**

- Follow Go standard project layout
- Use golangci-lint with strict config
- Maximum function complexity: cyclomatic complexity <15
- Documentation: godoc for all exported types/functions
- Error handling: wrap errors with context (fmt.Errorf with %w)

**Testing:**

- Test-driven development for critical paths (workflow orchestration, secrets)
- Minimum coverage: 70% overall, 90% for crypto/security code
- All edge cases covered (invalid input, network failures, race conditions)
- No flaky tests (use deterministic mocks, avoid sleep in tests)

**Documentation:**

- API documentation (inline comments for OpenAPI generation)
- Architecture diagrams (draw.io or mermaid)
- Database schema ER diagram
- Deployment guide (docker-compose, Kubernetes)

**Security:**

- Input validation (all API endpoints)
- SQL injection prevention (parameterized queries via GORM)
- XSS prevention (JSON API only, no HTML rendering)
- Secrets never logged (use masking)
- Dependency scanning (govulncheck)

---

## Deliverables

After completing all phases:

**Source Code:**

- `cmd/core/` - Core API binary
- `cmd/proxy/` - Edge Proxy binary (separate from core, to be implemented later)
- `cmd/agent/` - Agent binary (separate from core, to be implemented later)
- `internal/` - All business logic

**Tests:**

- `*_test.go` files throughout codebase
- `test/` directory with integration test helpers

**Documentation:**

- `README.md` - Project overview, local setup
- `docs/architecture/` - Architecture documents (already exist)
- `docs/api.md` - API reference (generated from code)
- `CONTRIBUTING.md` - Development guide

**Deployment:**

- `docker-compose.yml` - Local development environment
- `Dockerfile` - Production container images
- `Makefile` - Build automation

**Database:**

- `migrations/` - SQL migration files
- `docs/schema.md` - Database schema documentation

---

## Risk Analysis

**High Risks:**

- **Cloud Provider API Changes**: AWS/DigitalOcean/Hetzner APIs change
  - _Mitigation_: Abstract behind interface, pin SDK versions, add integration tests

- **WebSocket Scalability**: Hub can't handle 1000+ concurrent connections
  - _Mitigation_: Load test early (Phase 3), use connection pooling, consider clustering

- **Build Failures**: Complex build orchestration with race conditions
  - _Mitigation_: Comprehensive testing (Phase 4), use database transactions, implement retries

**Medium Risks:**

- **Database Performance**: Slow queries at scale
  - _Mitigation_: Add indexes early (Phase 0), use EXPLAIN ANALYZE, implement query logging

- **Secret Encryption Key Management**: Lost encryption key = lost secrets
  - _Mitigation_: Document key backup procedure, consider KMS integration

- **Docker Registry Storage**: Registry fills disk
  - _Mitigation_: Implement garbage collection, use S3 backend (Phase 8)

**Low Risks:**

- **JWT Token Expiration**: Users logged out unexpectedly
  - _Mitigation_: Implement refresh tokens, document TTL

---

## Future Enhancements (Post-MVP)

Features intentionally deferred:

- **Multi-Region Support**: Deploy Core in multiple regions for HA
  - _Reason_: Adds complexity, not needed for MVP

- **Custom Domain Support**: Users bring their own domains (custom-domain.com instead of \*.stagely.dev)
  - _Reason_: Requires per-environment SSL certs (Let's Encrypt rate limits)

- **Cost Tracking Dashboard**: Show detailed cloud spend per team/project
  - _Reason_: MVP uses BYO cloud model (users see costs in their cloud console)

- **Build Caching Optimization**: Warm cache for popular stacks (Node.js, Go, Python)
  - _Reason_: Optimization, not critical for functionality

- **Advanced RBAC**: Fine-grained permissions (can-deploy vs can-manage-secrets)
  - _Reason_: Simple roles (owner/admin/member) sufficient for MVP

- **GitHub Actions Integration**: Run builds via GitHub Actions instead of VMs
  - _Reason_: Different execution model, adds complexity

- **Slack/Discord Notifications**: Real-time notifications for deployments
  - _Reason_: Nice-to-have, not core functionality

---

**Ready for autonomous execution with:**

```bash
/autonomous-dev docs/roadmaps/2025-12-06-stagely-core-roadmap.md
```

**Or execute phase-by-phase manually:**

1. Implement Phase 0 (foundation)
2. Run tests, ensure passing
3. Implement Phase 1 (cloud providers)
4. Run tests, ensure passing
5. Continue through Phase 9

**Total estimated time:** 180 hours (4-5 weeks single developer, or 2-3 weeks with 2 developers parallelizing phases)
