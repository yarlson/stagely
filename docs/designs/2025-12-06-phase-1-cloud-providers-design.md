# Cloud Provider Interface and Implementations - Design Document

> **Status:** Ready for Implementation
> **Created:** 2025-12-06
> **Phase:** Phase 1 of Stagely Core Roadmap
> **Roadmap:** docs/roadmaps/2025-12-06-stagely-core-roadmap.md

## 1. Overview

### Problem Statement

Stagely needs to provision VMs across multiple cloud providers (AWS EC2, DigitalOcean Droplets, Hetzner Cloud Servers) with different APIs, authentication mechanisms, and instance type nomenclatures. Without a unified abstraction, the core orchestrator would need provider-specific logic, making it difficult to:

- Add new cloud providers
- Maintain existing provider integrations
- Test orchestration logic without real cloud API calls
- Switch between providers based on cost or availability

### Goals

- Define a unified `CloudProvider` interface that abstracts VM lifecycle operations
- Implement concrete providers for AWS, DigitalOcean, and Hetzner
- Create a provider registry for dynamic instantiation
- Map architecture-agnostic sizes (small/medium/large) to provider-specific instance types
- Support multi-architecture (amd64/arm64) instance provisioning
- Encrypt and securely store cloud provider credentials
- Provide mock implementation for testing

### Non-Goals

- Multi-region HA (deferred to post-MVP)
- Cost optimization algorithms (users choose their provider)
- Spot instance bidding strategies (basic spot support only)
- Custom VPC/networking configuration (use default VPC)
- Auto-scaling of Preview environments (each PR gets one VM)

### Success Criteria

- All three providers can create, query, and terminate instances
- Architecture mapping works correctly (amd64 → t3.small, arm64 → t4g.small)
- Size mapping is consistent across providers (small = ~2vCPU, medium = ~4vCPU, large = ~8vCPU)
- Credentials are encrypted at rest using existing crypto utilities
- Mock provider enables testing without cloud API calls
- Provider registry allows dynamic provider selection
- All integration tests pass with real cloud credentials

## 2. Architecture

### High-Level Design

The cloud provider abstraction follows the **Strategy Pattern** with a **Factory Pattern** for instantiation:

1. **CloudProvider Interface**: Defines contract for all providers (CreateInstance, GetInstanceStatus, TerminateInstance, ValidateCredentials)
2. **Concrete Implementations**: AWS (EC2), DigitalOcean (Droplets), Hetzner (Cloud Servers)
3. **Provider Registry**: Factory for creating providers from database credentials
4. **Instance Mapper**: Translates size+architecture to provider-specific types
5. **Mock Provider**: In-memory implementation for testing

### Data Flow

```
Orchestrator
    ↓
Provider Registry (loads from DB)
    ↓
Concrete Provider (AWS/DO/Hetzner)
    ↓
Cloud Provider SDK
    ↓
Cloud Provider API
    ↓
VM Instance Created
```

### Technology Choices

**AWS SDK**: `github.com/aws/aws-sdk-go-v2/service/ec2`
- Rationale: Official AWS SDK, well-maintained, supports latest Go features
- Alternatives: aws-sdk-go v1 (deprecated), third-party wrappers (less reliable)

**DigitalOcean SDK**: `github.com/digitalocean/godo`
- Rationale: Official DO client, idiomatic Go, comprehensive API coverage
- Alternatives: Custom HTTP client (more maintenance), third-party wrappers

**Hetzner SDK**: `github.com/hetznercloud/hcloud-go/v2`
- Rationale: Official Hetzner client, well-documented, active development
- Alternatives: Custom HTTP client, REST API directly

**Design Pattern**: Strategy + Factory
- Rationale: Allows adding providers without modifying orchestrator, testable
- Alternatives: Adapter pattern (more complex), direct provider coupling (unmaintainable)

## 3. Design Decisions

### Decision 1: Interface-First Design

**Chosen**: Define interface before implementations
**Rationale**:
- Forces consistent API across providers
- Enables mock-first testing
- Documents contract clearly
- Prevents provider-specific leakage

**Alternatives Considered**:
- Implementation-first: Would lead to inconsistent APIs
- Abstract base class: Go doesn't support inheritance, interfaces are idiomatic

**Trade-offs**:
- Upfront design time
- May need interface changes if provider limitations discovered

### Decision 2: Size-Based Instance Selection

**Chosen**: Abstract sizes (small/medium/large) mapped to provider types
**Rationale**:
- User-friendly (no need to know t3.small vs cx21)
- Consistent cost expectations across providers
- Easier to add new providers
- Aligns with stagely.yaml simplicity goal

**Alternatives Considered**:
- Expose provider-specific types: Breaks abstraction, poor UX
- Auto-select based on workload: Premature optimization, unpredictable costs
- Fixed single size: Inflexible, wasteful for small apps

**Trade-offs**:
- Coarse-grained control (can't fine-tune exact vCPU/RAM)
- Provider cost variations within same "size"

**Mapping**:
```
small:  ~2 vCPU, ~4GB RAM  (Build VMs)
medium: ~4 vCPU, ~8GB RAM  (Preview VMs, default)
large:  ~8 vCPU, ~16GB RAM (Heavy builds)
```

### Decision 3: Architecture Support Strategy

**Chosen**: Support amd64 and arm64, with provider-specific fallbacks
**Rationale**:
- ARM64 offers cost savings (AWS Graviton)
- Multi-arch Docker builds require native architecture
- DigitalOcean lacks ARM → warn and use amd64 with QEMU

**Alternatives Considered**:
- AMD64 only: Misses cost savings, slower ARM builds via emulation
- ARM64 only: Not universally available, compatibility issues
- User-specified architecture: More complex UX

**Trade-offs**:
- Increased testing matrix
- DigitalOcean performance penalty for ARM builds

### Decision 4: Credential Storage and Encryption

**Chosen**: Store encrypted credentials in database, decrypt on-demand
**Rationale**:
- Credentials never in plaintext at rest
- Uses existing crypto utilities (AES-256-GCM)
- Per-project credentials (multi-tenancy support)
- Audit trail via database

**Alternatives Considered**:
- Environment variables: Not multi-tenant, poor security
- External secret manager (AWS Secrets Manager): Added cost, complexity
- Encrypted files on disk: Harder to manage, no audit trail

**Trade-offs**:
- Decrypt operation on every VM provision (acceptable latency)
- Encryption key management is critical (document backup)

### Decision 5: Provider Registry Pattern

**Chosen**: Centralized registry with factory methods
**Rationale**:
- Single point to instantiate providers
- Caches provider instances (reduce DB queries)
- Thread-safe access
- Easy to add new providers

**Alternatives Considered**:
- Direct instantiation: Scattered provider creation, hard to test
- Dependency injection framework: Overkill for this use case

**Trade-offs**:
- Singleton-like behavior (acceptable for this use case)
- Registry must be initialized at startup

## 4. Component Details

### Component: CloudProvider Interface

**Purpose**: Define contract for all cloud provider implementations

**Location**: `internal/providers/provider.go`

**Interface Definition**:
```go
type CloudProvider interface {
    // Name returns the provider identifier (e.g., "aws", "digitalocean", "hetzner")
    Name() string

    // CreateInstance provisions a new VM instance
    // Returns instanceID (cloud-specific ID) and public IP
    CreateInstance(ctx context.Context, spec InstanceSpec) (instanceID string, publicIP string, error)

    // GetInstanceStatus queries current instance state
    GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error)

    // TerminateInstance deletes the instance (idempotent)
    TerminateInstance(ctx context.Context, instanceID string) error

    // ValidateCredentials tests authentication (fails fast)
    ValidateCredentials(ctx context.Context) error

    // GetPricing returns hourly cost estimate for size/region (optional, best-effort)
    GetPricing(ctx context.Context, size, region string) (float64, error)
}
```

**Data Structures**:
```go
type InstanceSpec struct {
    Size         string            // "small", "medium", "large"
    Architecture string            // "amd64", "arm64"
    Region       string            // Provider-specific region code
    UserData     string            // Cloud-init script
    Tags         map[string]string // Metadata tags
    SpotInstance bool              // Use spot/preemptible if supported
}

type InstanceStatus struct {
    State      string    // "pending", "running", "stopped", "terminated"
    PublicIP   string    // IPv4 address
    PrivateIP  string    // Private IP (if applicable)
    LaunchedAt time.Time // Creation timestamp
    Ready      bool      // True when SSH/agent can connect
}
```

**Dependencies**: None (pure interface)

### Component: AWS Provider

**Purpose**: Implement CloudProvider for AWS EC2

**Location**: `internal/providers/aws.go`

**Responsibilities**:
- Authenticate using Access Key + Secret Key
- Map sizes to EC2 instance types (t3.x for amd64, t4g.x for arm64)
- Select appropriate AMI (Ubuntu 22.04 LTS)
- Handle spot instance requests
- Poll for public IP assignment (EC2 assigns asynchronously)
- Use default VPC and security group

**Key Methods**:
```go
func (p *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    // 1. Map size+arch to instance type (e.g., small+amd64 → t3.small)
    // 2. Select AMI based on architecture and region
    // 3. Launch instance with UserData
    // 4. Wait for public IP (poll with 30s timeout)
    // 5. Tag instance
    // 6. Return instance ID and IP
}
```

**Instance Type Mapping**:
```
small+amd64  → t3.small   (2 vCPU, 2GB)
small+arm64  → t4g.small  (2 vCPU, 2GB)
medium+amd64 → c5.xlarge  (4 vCPU, 8GB)
medium+arm64 → c6g.xlarge (4 vCPU, 8GB)
large+amd64  → c5.2xlarge (8 vCPU, 16GB)
large+arm64  → c6g.2xlarge(8 vCPU, 16GB)
```

**AMI Selection**:
- Use canonical Ubuntu 22.04 LTS images
- Lookup via DescribeImages with filters (owner: Canonical, name pattern)
- Cache AMI IDs per region+architecture

**Error Handling**:
- Invalid credentials → ValidateCredentials fails fast
- Quota exceeded → Return descriptive error
- Region not found → Return descriptive error
- Timeout waiting for IP → Clean up instance, return error

### Component: DigitalOcean Provider

**Purpose**: Implement CloudProvider for DigitalOcean Droplets

**Location**: `internal/providers/digitalocean.go`

**Responsibilities**:
- Authenticate using API token
- Map sizes to Droplet slugs
- Note: NO ARM64 support (warn users, use amd64 with QEMU for ARM builds)
- DigitalOcean returns IP immediately (no polling needed)
- Use ubuntu-22-04-x64 image

**Instance Type Mapping**:
```
small+amd64  → s-2vcpu-4gb  (2 vCPU, 4GB)
small+arm64  → s-2vcpu-4gb  (NO ARM, log warning)
medium+amd64 → c-4          (4 vCPU, 8GB)
medium+arm64 → c-4          (NO ARM, log warning)
large+amd64  → c-8          (8 vCPU, 16GB)
large+arm64  → c-8          (NO ARM, log warning)
```

**ARM64 Handling**:
```go
if spec.Architecture == "arm64" {
    log.Warn("DigitalOcean does not support ARM64, using amd64 with QEMU emulation (slower)")
    // Use amd64 droplet, agent will use QEMU for ARM Docker builds
}
```

**Error Handling**:
- Invalid token → ValidateCredentials fails
- Region invalid → Return error
- Droplet creation failure → Return error

### Component: Hetzner Provider

**Purpose**: Implement CloudProvider for Hetzner Cloud Servers

**Location**: `internal/providers/hetzner.go`

**Responsibilities**:
- Authenticate using API token
- Map sizes to server types
- Support ARM64 via CAX server types
- Hetzner returns IP immediately (no polling)
- Use ubuntu-22.04 image

**Instance Type Mapping**:
```
small+amd64  → cx21  (2 vCPU, 4GB)
small+arm64  → cax11 (2 vCPU, 4GB)
medium+amd64 → cx31  (2 vCPU, 8GB)
medium+arm64 → cax21 (4 vCPU, 8GB)
large+amd64  → cx41  (4 vCPU, 16GB)
large+arm64  → cax31 (8 vCPU, 16GB)
```

**Note**: Hetzner ARM (CAX) types have slightly different vCPU counts

**Error Handling**:
- Invalid token → ValidateCredentials fails
- Location invalid → Return error
- Server creation failure → Return error

### Component: Provider Registry

**Purpose**: Factory for creating and caching provider instances

**Location**: `internal/providers/registry.go`

**Responsibilities**:
- Load cloud provider credentials from database
- Decrypt credentials using crypto utilities
- Instantiate appropriate provider implementation
- Cache provider instances (thread-safe)
- Validate credentials on first use

**Key Methods**:
```go
type Registry struct {
    db       *gorm.DB
    crypto   *crypto.Encryptor
    cache    map[string]CloudProvider
    cacheMu  sync.RWMutex
}

func (r *Registry) GetProvider(ctx context.Context, providerID string) (CloudProvider, error) {
    // 1. Check cache
    // 2. If not cached, load from database
    // 3. Decrypt credentials
    // 4. Instantiate provider
    // 5. Validate credentials
    // 6. Cache and return
}
```

**Thread Safety**: Use sync.RWMutex for cache access

### Component: Mock Provider

**Purpose**: In-memory provider for testing without cloud API calls

**Location**: `internal/providers/mock.go`

**Responsibilities**:
- Simulate VM lifecycle (create, status, terminate)
- Configurable delays (simulate provisioning time)
- Error injection (test error handling)
- State tracking (instances created)

**Implementation**:
```go
type MockProvider struct {
    instances map[string]*MockInstance // instanceID → instance
    mu        sync.Mutex
    delay     time.Duration // Simulate provisioning delay
}

type MockInstance struct {
    ID         string
    State      string
    PublicIP   string
    LaunchedAt time.Time
}

func (m *MockProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    // Simulate delay
    time.Sleep(m.delay)

    // Generate fake instance ID and IP
    instanceID := "mock-" + nanoid.New()
    publicIP := fmt.Sprintf("203.0.113.%d", len(m.instances)+1)

    // Store instance
    m.mu.Lock()
    m.instances[instanceID] = &MockInstance{
        ID: instanceID,
        State: "running",
        PublicIP: publicIP,
        LaunchedAt: time.Now(),
    }
    m.mu.Unlock()

    return instanceID, publicIP, nil
}
```

**Configurable Errors**:
```go
type MockProviderWithErrors struct {
    *MockProvider
    ShouldFailCreate    bool
    ShouldFailStatus    bool
    ShouldFailTerminate bool
}
```

## 5. Error Handling

### Error Scenarios

**Invalid Credentials**:
- Detect: ValidateCredentials returns error
- Behavior: Fail fast, return descriptive error
- User Message: "Invalid AWS credentials for project X"

**Quota Exceeded**:
- Detect: Cloud API returns quota error
- Behavior: Return error, do not retry
- User Message: "AWS instance quota exceeded in region us-east-1"

**Network Timeout**:
- Detect: Context deadline exceeded
- Behavior: Return error, clean up partial resources
- User Message: "Timeout provisioning instance, check cloud provider status"

**Instance Provisioning Failure**:
- Detect: Instance enters "error" state
- Behavior: Terminate instance, return error
- User Message: "Failed to provision instance: [cloud provider error]"

**Invalid Region**:
- Detect: Cloud API returns "region not found"
- Behavior: Fail fast, return error
- User Message: "Invalid region 'us-west-99' for AWS"

**Invalid Instance Type**:
- Detect: Cloud API returns "instance type not available"
- Behavior: Return error with suggestion
- User Message: "Instance type t3.small not available in region, try different size"

### Recovery Strategies

**Retry Logic**:
- Transient errors (network): Retry up to 3 times with exponential backoff
- Quota errors: Do NOT retry
- Authentication errors: Do NOT retry

**Cleanup on Failure**:
- If CreateInstance fails after instance created, terminate instance
- Use context with timeout to prevent hanging

**Graceful Degradation**:
- If GetPricing fails, return 0.0 (optional feature)
- Continue operation without pricing data

## 6. Testing Strategy

### Unit Tests

**Instance Type Mapping**:
```go
func TestInstanceTypeMapping(t *testing.T) {
    // Test all size+arch combinations
    // Verify correct instance type returned
}
```

**Registry Caching**:
```go
func TestRegistryCache(t *testing.T) {
    // Load provider twice
    // Verify database queried only once
}
```

**Credential Encryption**:
```go
func TestCredentialEncryption(t *testing.T) {
    // Store encrypted credentials
    // Load and decrypt
    // Verify round-trip
}
```

### Integration Tests (with real cloud credentials)

**AWS Integration**:
```go
func TestAWSProvider_Integration(t *testing.T) {
    if os.Getenv("AWS_ACCESS_KEY_ID") == "" {
        t.Skip("AWS credentials not configured")
    }

    provider := NewAWSProvider(creds)

    // Create instance
    instanceID, ip, err := provider.CreateInstance(ctx, spec)
    require.NoError(t, err)
    require.NotEmpty(t, instanceID)
    require.NotEmpty(t, ip)

    // Get status
    status, err := provider.GetInstanceStatus(ctx, instanceID)
    require.NoError(t, err)
    require.Equal(t, "running", status.State)

    // Terminate
    err = provider.TerminateInstance(ctx, instanceID)
    require.NoError(t, err)
}
```

**Similar tests for DigitalOcean and Hetzner**

### Mock Provider Tests

```go
func TestOrchestrator_WithMockProvider(t *testing.T) {
    mockProvider := providers.NewMockProvider()
    registry := providers.NewRegistry(db)
    registry.Register("mock", mockProvider)

    orchestrator := NewOrchestrator(registry)

    // Test full workflow without cloud API calls
}
```

### Edge Cases

- **Empty UserData**: Should work (no cloud-init)
- **Invalid Architecture**: Return error
- **Very long tag values**: Truncate or error
- **Concurrent instance creation**: Test thread safety
- **Provider not found in registry**: Return error

## 7. Implementation Considerations

### Potential Challenges

**AMI Selection for AWS**:
- Challenge: AMI IDs vary by region
- Solution: Use DescribeImages API with filters, cache results

**Spot Instance Handling**:
- Challenge: Spot requests may not be fulfilled immediately
- Solution: Wait up to 2 minutes, then fall back to on-demand

**DigitalOcean ARM64 Limitation**:
- Challenge: No native ARM64 support
- Solution: Log warning, use amd64 with QEMU (slower but works)

**Credential Rotation**:
- Challenge: Credentials may expire or be rotated
- Solution: Cache invalidation on auth failure, retry with fresh credentials

**Rate Limiting**:
- Challenge: Cloud APIs have rate limits
- Solution: Implement exponential backoff, respect Retry-After headers

### Areas Needing Special Attention

**Security**:
- Credentials must never be logged in plaintext
- Use parameterized queries for database access
- Validate all user inputs (region, size, architecture)

**Performance**:
- Cache provider instances (reduce DB queries)
- Cache AMI lookups (reduce API calls)
- Use context with timeout (prevent hanging)

**Reliability**:
- Idempotent operations (safe to retry)
- Clean up resources on failure
- Handle partial failures gracefully

### Dependencies on Other Systems

**Phase 0 Dependencies**:
- `internal/crypto/encrypt.go`: Encrypt/decrypt credentials
- `internal/db/db.go`: Database connection
- Database migration for `cloud_providers` table (if not exists)

**Database Schema**:
```sql
CREATE TABLE cloud_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id),
    name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- 'aws', 'digitalocean', 'hetzner'
    encrypted_credentials TEXT NOT NULL, -- JSON blob, encrypted
    region VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, name)
);
```

**Credentials JSON Structure**:
```json
// AWS
{
  "access_key_id": "AKIA...",
  "secret_access_key": "...",
  "region": "us-east-1"
}

// DigitalOcean
{
  "api_token": "dop_v1_...",
  "region": "nyc3"
}

// Hetzner
{
  "api_token": "...",
  "location": "nbg1"
}
```

## 8. Future Enhancements

### Features Intentionally Deferred

**Multi-Region Support**:
- Reason: Adds complexity, single region sufficient for MVP
- Implementation: Add `regions []string` to provider, round-robin selection

**Custom VPC/Networking**:
- Reason: Use default VPC for simplicity
- Implementation: Add `VPCConfig` to InstanceSpec

**Advanced Spot Instance Strategies**:
- Reason: Basic spot support sufficient
- Implementation: Add bid price, fallback logic

**Cost Tracking**:
- Reason: Users see costs in their cloud console
- Implementation: Store pricing data, aggregate in dashboard

**Provider Health Checks**:
- Reason: Cloud providers rarely down
- Implementation: Periodic ValidateCredentials, mark unhealthy

**Terraform/IaC Integration**:
- Reason: Direct API calls simpler for MVP
- Implementation: Generate Terraform configs, apply via API

### Extension Points

**Adding New Providers**:
1. Implement `CloudProvider` interface
2. Add instance type mapping
3. Register in registry
4. Add integration tests
5. Document in roadmap

**Example: GCP Support**
```go
type GCPProvider struct {
    credentials *google.Credentials
    computeClient *compute.Service
}

func (p *GCPProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    // Use n1-standard-2 for small
    // Use n2-standard-4 for medium
    // Use n2-standard-8 for large
}
```

### Migration Considerations

**Changing Encryption Algorithm**:
- Current: AES-256-GCM
- Future: Rotate to new algorithm
- Migration: Decrypt with old, re-encrypt with new, mark migration_version

**Provider Schema Changes**:
- Add `schema_version` field to credentials JSON
- Implement migrations for old versions

## 9. Implementation Plan Reference

**Next Step**: Proceed to autonomous planning phase

**Planning Phase Will Generate**:
- Bite-sized tasks (10-15 min each)
- Test-driven implementation steps
- Complete code examples
- Verification commands

**Estimated Effort**: 20 hours (per roadmap)

**Files to Create**:
- `internal/providers/provider.go` (interface)
- `internal/providers/aws.go` (AWS implementation)
- `internal/providers/digitalocean.go` (DO implementation)
- `internal/providers/hetzner.go` (Hetzner implementation)
- `internal/providers/registry.go` (factory)
- `internal/providers/mock.go` (testing)
- `internal/providers/*_test.go` (tests)
- `internal/models/cloud_provider.go` (database model)
- `migrations/005_create_cloud_providers.sql` (schema)

**Dependencies to Add**:
- `github.com/aws/aws-sdk-go-v2/service/ec2`
- `github.com/aws/aws-sdk-go-v2/config`
- `github.com/digitalocean/godo`
- `github.com/hetznercloud/hcloud-go/v2`

---

**Design Complete**: Ready for autonomous planning phase
