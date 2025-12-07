# Phase 1: Cloud Provider Interface and Implementations - Design Document

> **Status:** Ready for Implementation
> **Created:** 2025-12-07
> **Phase:** 1 of 9
> **Roadmap:** docs/roadmaps/2025-12-06-stagely-core-roadmap.md

## 1. Overview

### Problem Statement

Stagely needs to provision VMs across multiple cloud providers (AWS EC2, DigitalOcean Droplets, Hetzner Cloud) with different APIs, instance types, and authentication mechanisms. Without a unified abstraction, the core orchestrator would require provider-specific logic scattered throughout the codebase, making it difficult to add new providers, test the system, or maintain existing implementations.

### Goals

- Define a clean, provider-agnostic interface for VM lifecycle management
- Implement support for three cloud providers: AWS, DigitalOcean, Hetzner
- Support multiple architectures (amd64, arm64) with provider-specific mapping
- Support instance size abstraction (small/medium/large → provider-specific types)
- Integrate with existing crypto module for credential encryption
- Enable easy testing with mock provider implementation
- Support spot/preemptible instances where available

### Non-Goals

- Auto-scaling or cluster management (future enhancement)
- Multi-region HA deployment (future enhancement)
- Cost optimization algorithms (future enhancement)
- Custom networking/VPC configuration (use defaults)
- Volume/storage management (use instance storage only)

### Success Criteria

- All three providers implement the same interface
- Mock provider enables fast testing without cloud API calls
- Architecture mapping works correctly (amd64/arm64 → provider types)
- Size mapping works correctly (small/medium/large → provider types)
- Credentials are encrypted at rest using existing crypto module
- Provider registry enables dynamic provider instantiation
- All integration tests pass with real cloud APIs
- All unit tests pass with mock provider

## 2. Architecture

### High-Level Design

The cloud provider abstraction follows the **Strategy Pattern** with a central `CloudProvider` interface and provider-specific implementations. A **Registry Pattern** manages provider instantiation and caching. The architecture is designed for:

1. **Simplicity**: Single interface, minimal methods, clear contracts
2. **Testability**: Mock provider for fast tests, real providers for integration
3. **Extensibility**: Adding new providers requires implementing one interface
4. **Type Safety**: Go interfaces ensure compile-time verification

**Key insight**: We abstract the _behavior_ (create, status, terminate) rather than the _API calls_. Each provider translates our semantic size/arch specifications into provider-specific instance types internally.

### Component Overview

```
internal/providers/
├── provider.go          # CloudProvider interface + types
├── registry.go          # Provider registration and factory
├── aws.go               # AWS EC2 implementation
├── digitalocean.go      # DigitalOcean Droplet implementation
├── hetzner.go           # Hetzner Cloud implementation
├── mock.go              # In-memory mock for testing
├── aws_test.go          # AWS integration tests
├── digitalocean_test.go # DigitalOcean integration tests
├── hetzner_test.go      # Hetzner integration tests
└── mock_test.go         # Mock provider unit tests
```

### Data Flow

1. **Provisioning Flow**:
   - Orchestrator calls `CreateInstance(ctx, spec)` on provider
   - Provider maps size/arch to provider-specific instance type
   - Provider makes API call to cloud (EC2.RunInstances, etc.)
   - Provider polls for public IP assignment (if needed)
   - Provider returns instanceID and publicIP

2. **Status Flow**:
   - Orchestrator calls `GetInstanceStatus(ctx, instanceID)`
   - Provider queries cloud API for instance state
   - Provider translates cloud-specific state to our enum
   - Provider returns InstanceStatus with normalized fields

3. **Termination Flow**:
   - Orchestrator calls `TerminateInstance(ctx, instanceID)`
   - Provider makes cloud API call to terminate
   - Provider confirms deletion (may poll briefly)

### Technology Choices

**AWS SDK**: `github.com/aws/aws-sdk-go-v2`

- **Rationale**: Official AWS Go SDK v2, modern API, context support, better error handling than v1
- **Trade-off**: More verbose than v1, but better long-term support

**DigitalOcean**: `github.com/digitalocean/godo`

- **Rationale**: Official DigitalOcean Go client, well-maintained, clean API
- **Trade-off**: Less feature-rich than AWS SDK, but sufficient for our needs

**Hetzner**: `github.com/hetznercloud/hcloud-go/v2`

- **Rationale**: Official Hetzner Cloud Go client, excellent API design, strong typing
- **Trade-off**: Smaller ecosystem than AWS/DO, but reliable

**Mock Provider**: In-memory implementation

- **Rationale**: Fast tests, deterministic behavior, no cloud costs
- **Trade-off**: Doesn't catch cloud-specific issues, but integration tests cover that

## 3. Design Decisions

### Decision 1: Interface Over Abstract Base Class

**Choice**: Use Go interface rather than embedded struct with shared logic.

**Alternatives Considered**:

1. **Embedded base struct**: Common fields/methods in `BaseProvider`, embed in implementations
   - Rejected: Go interfaces are idiomatic, base class pattern is un-Go-like
2. **Single mega-implementation**: One struct with switch statements for each provider
   - Rejected: Violates Single Responsibility, hard to test, poor separation of concerns

**Rationale**: Go interfaces enable clean abstraction, easy mocking, and compile-time verification. Each provider is fully independent, making testing and debugging easier.

### Decision 2: Size Abstraction (small/medium/large)

**Choice**: Abstract sizes map to provider-specific instance types internally.

**Alternatives Considered**:

1. **Direct instance type specification**: User specifies "t3.small" or "cx21"
   - Rejected: Locks users into provider-specific knowledge, breaks abstraction
2. **CPU/RAM specification**: User specifies "2 vCPU, 4GB RAM"
   - Rejected: Providers don't always offer exact matches, requires complex matching logic

**Rationale**: Three sizes (small/medium/large) cover 90% of use cases. Simple, provider-agnostic, and easy to extend with "xlarge" later if needed. Matches industry practice (Heroku, Render, etc.).

### Decision 3: Architecture Support (amd64/arm64)

**Choice**: Support both architectures, fall back gracefully if provider doesn't support one.

**Alternatives Considered**:

1. **amd64 only**: Ignore ARM entirely
   - Rejected: ARM instances are cheaper and becoming standard (AWS Graviton, Hetzner CAX)
2. **Error on unsupported arch**: Return error if provider doesn't support requested arch
   - Rejected: Poor UX, forces user to know provider limitations

**Rationale**: Support both, use QEMU emulation fallback for DigitalOcean (doesn't support ARM natively). Log warning but proceed. Users can override if needed.

### Decision 4: Credential Storage

**Choice**: Store encrypted credentials in database, decrypt on provider instantiation.

**Alternatives Considered**:

1. **Plain text in database**: No encryption
   - Rejected: Security risk, violates best practices
2. **Cloud KMS**: Use AWS KMS, Google Cloud KMS
   - Rejected: Adds cloud dependency, complexity, cost. Phase 0 crypto is sufficient.
3. **HashiCorp Vault**: External secret management
   - Rejected: Over-engineering for MVP, adds operational burden

**Rationale**: Existing crypto module (AES-256-GCM) is battle-tested and sufficient. No external dependencies. Simple key rotation via re-encryption.

### Decision 5: Provider Registry Pattern

**Choice**: Thread-safe registry with factory function.

**Alternatives Considered**:

1. **Direct instantiation**: Orchestrator creates providers directly
   - Rejected: Duplicates credential loading, no caching
2. **Singleton per provider**: Global singletons
   - Rejected: Hard to test, global state, concurrency issues

**Rationale**: Registry provides:

- Centralized provider creation
- Credential loading abstraction
- Thread-safe caching (same credentials → same instance)
- Easy testing (inject mock registry)

### Decision 6: Spot Instance Support

**Choice**: Support spot/preemptible via boolean flag, best-effort basis.

**Alternatives Considered**:

1. **Always use spot**: Default to spot instances
   - Rejected: Unpredictable interruptions, not suitable for preview environments
2. **No spot support**: Only on-demand
   - Rejected: Leaves cost optimization on table for build VMs

**Rationale**: Spot instances are ideal for short-lived build VMs (5-15 min), not preview VMs (hours/days). Flag enables selective use. Fallback to on-demand if spot unavailable.

## 4. Component Details

### 4.1 CloudProvider Interface

**Purpose**: Define contract for all cloud provider implementations.

**Interface**:

```go
type CloudProvider interface {
    // Name returns the provider identifier (e.g., "aws", "digitalocean", "hetzner")
    Name() string

    // CreateInstance provisions a new VM with the given specification
    // Returns instanceID and publicIP (or error if provisioning fails)
    CreateInstance(ctx context.Context, spec InstanceSpec) (instanceID string, publicIP string, error)

    // GetInstanceStatus returns the current status of an instance
    GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error)

    // TerminateInstance deletes an instance (idempotent - no error if already terminated)
    TerminateInstance(ctx context.Context, instanceID string) error

    // ValidateCredentials verifies that stored credentials are valid
    // Should make a lightweight API call (e.g., list regions)
    ValidateCredentials(ctx context.Context) error
}
```

**Data Structures**:

```go
// InstanceSpec specifies what kind of VM to provision
type InstanceSpec struct {
    Size         string            // "small", "medium", "large"
    Architecture string            // "amd64", "arm64"
    Region       string            // Provider-specific (e.g., "us-east-1", "nyc3")
    UserData     string            // Cloud-init script (base64 NOT required)
    Tags         map[string]string // Instance tags/labels
    SpotInstance bool              // Request spot/preemptible instance
}

// InstanceStatus represents normalized instance state
type InstanceStatus struct {
    State      string    // "pending", "running", "stopped", "terminated"
    PublicIP   string    // Empty if not yet assigned
    PrivateIP  string    // Empty if not applicable
    LaunchedAt time.Time // Instance creation timestamp
    Ready      bool      // True if state == "running" AND publicIP assigned
}
```

**Design Notes**:

- Methods are context-aware for cancellation/timeouts
- No `StopInstance` or `StartInstance` - we only provision and terminate (ephemeral VMs)
- `ValidateCredentials` enables pre-flight checks before workflow starts
- `Ready` field simplifies orchestrator logic (don't need to check both state and IP)

### 4.2 Provider Registry

**Purpose**: Manage provider instantiation from encrypted credentials.

**Interface**:

```go
type Registry struct {
    mu        sync.RWMutex
    providers map[string]CloudProvider
    key       []byte // Encryption key for decrypting credentials
}

func NewRegistry(encryptionKey []byte) *Registry

// GetProvider retrieves or creates a provider instance
// Caches providers by unique credential hash to avoid re-instantiation
func (r *Registry) GetProvider(ctx context.Context, providerType string, encryptedCredentials string) (CloudProvider, error)

// RegisterProvider adds a custom provider (useful for testing)
func (r *Registry) RegisterProvider(name string, provider CloudProvider)
```

**Implementation Notes**:

- Credentials are decrypted using existing crypto module
- Provider instances are cached by hash of decrypted credentials
- Thread-safe with RWMutex (many readers, occasional writer)
- Supports custom provider injection for testing

### 4.3 AWS Provider

**Credentials Format** (JSON, encrypted in DB):

```json
{
  "access_key_id": "AKIA...",
  "secret_access_key": "...",
  "region": "us-east-1"
}
```

**Instance Type Mapping**:

```
Size: small  + amd64 → t3.small   (2 vCPU, 2GB RAM)
Size: small  + arm64 → t4g.small  (2 vCPU, 2GB RAM, Graviton)
Size: medium + amd64 → c5.xlarge  (4 vCPU, 8GB RAM)
Size: medium + arm64 → c6g.xlarge (4 vCPU, 8GB RAM, Graviton)
Size: large  + amd64 → c5.2xlarge (8 vCPU, 16GB RAM)
Size: large  + arm64 → c6g.2xlarge(8 vCPU, 16GB RAM, Graviton)
```

**AMI Selection**:

- Ubuntu 22.04 LTS (amd64): `ami-0c7217cdde317cfec` (us-east-1)
- Ubuntu 22.04 LTS (arm64): `ami-0a0c8eebcdd6dcbd0` (us-east-1)
- Note: AMI IDs vary by region, use AWS Systems Manager Parameter Store in production

**Spot Instance Handling**:

- Use EC2 Fleet API with `SpotOptions` if `SpotInstance=true`
- Fallback to on-demand if spot capacity unavailable
- Set max price = on-demand price to avoid surprises

**Public IP Assignment**:

- Request public IP during launch (`AssociatePublicIpAddress=true`)
- Poll `DescribeInstances` until `PublicIpAddress` field populated
- Timeout after 2 minutes (usually assigned in 10-30 seconds)

### 4.4 DigitalOcean Provider

**Credentials Format**:

```json
{
  "api_token": "dop_v1_...",
  "region": "nyc3"
}
```

**Instance Type Mapping** (Droplet slugs):

```
Size: small  + amd64 → s-2vcpu-4gb   (2 vCPU, 4GB RAM, $24/mo)
Size: small  + arm64 → s-2vcpu-4gb + QEMU warning
Size: medium + amd64 → c-4           (4 vCPU, 8GB RAM, $80/mo)
Size: medium + arm64 → c-4 + QEMU warning
Size: large  + amd64 → c-8           (8 vCPU, 16GB RAM, $160/mo)
Size: large  + arm64 → c-8 + QEMU warning
```

**Image Selection**:

- Ubuntu 22.04 LTS: slug `ubuntu-22-04-x64`
- No ARM images available (DigitalOcean doesn't support ARM natively)
- Log warning if ARM requested, proceed with amd64 + note for user

**Spot Instance Handling**:

- DigitalOcean doesn't support spot instances
- Ignore `SpotInstance` flag, log warning

**Public IP Assignment**:

- Droplets get public IP immediately upon creation
- No polling needed (IP available in CreateDroplet response)

### 4.5 Hetzner Provider

**Credentials Format**:

```json
{
  "api_token": "...",
  "location": "nbg1"
}
```

**Instance Type Mapping**:

```
Size: small  + amd64 → cx21  (2 vCPU, 4GB RAM, €5.04/mo)
Size: small  + arm64 → cax11 (2 vCPU, 4GB RAM, €3.85/mo, Ampere Altra)
Size: medium + amd64 → cx31  (4 vCPU, 8GB RAM, €10.08/mo)
Size: medium + arm64 → cax21 (4 vCPU, 8GB RAM, €7.70/mo)
Size: large  + amd64 → cx41  (8 vCPU, 16GB RAM, €20.16/mo)
Size: large  + arm64 → cax31 (8 vCPU, 16GB RAM, €15.40/mo)
```

**Image Selection**:

- Ubuntu 22.04 (amd64): image name `ubuntu-22.04`
- Ubuntu 22.04 (arm64): image name `ubuntu-22.04` (Hetzner auto-selects by server type)

**Spot Instance Handling**:

- Hetzner doesn't support spot instances
- Ignore `SpotInstance` flag

**Public IP Assignment**:

- Servers get public IPv4 immediately upon creation
- No polling needed (IP available in CreateServer response)

### 4.6 Mock Provider

**Purpose**: Fast, deterministic testing without cloud API calls.

**Implementation**:

```go
type MockProvider struct {
    mu        sync.RWMutex
    instances map[string]*mockInstance // instanceID → instance
    nextID    int
    delay     time.Duration // Simulate provisioning delay
}

type mockInstance struct {
    id         string
    publicIP   string
    state      string
    launchedAt time.Time
}
```

**Behavior**:

- `CreateInstance`: Generates fake instance ID, assigns fake IP (192.0.2.X), sleeps for `delay`
- `GetInstanceStatus`: Returns stored instance state
- `TerminateInstance`: Marks instance as "terminated"
- `ValidateCredentials`: Always succeeds

**Configurable Failures**:

- Add `FailNext bool` field to simulate transient errors
- Add `QuotaExceeded bool` to test quota limit handling

## 5. Error Handling

### Error Categories

1. **Credential Errors**: Invalid API keys, insufficient permissions
   - Return: `ErrInvalidCredentials` (wrapped original error)
   - Recovery: User must update credentials in database

2. **Quota Errors**: Instance limit reached, CPU quota exceeded
   - Return: `ErrQuotaExceeded` (wrapped original error)
   - Recovery: User must request quota increase or use different region

3. **Network Errors**: API unreachable, timeout
   - Return: `ErrNetworkFailure` (wrapped original error)
   - Recovery: Retry with exponential backoff (orchestrator handles)

4. **Invalid Input**: Unsupported region, invalid size
   - Return: `ErrInvalidInput` (wrapped validation error)
   - Recovery: Fix input, retry

5. **Instance Not Found**: InstanceID doesn't exist (for GetStatus/Terminate)
   - Return: `ErrInstanceNotFound`
   - Recovery: For Terminate, treat as success (idempotent). For GetStatus, propagate error.

### Error Wrapping

Use Go 1.13+ error wrapping:

```go
if err != nil {
    return "", "", fmt.Errorf("failed to create EC2 instance: %w", err)
}
```

This enables:

- `errors.Is()` for error type checking
- `errors.As()` for extracting wrapped errors
- Full error chain in logs

### Retry Logic

**Not** implemented in provider layer - orchestrator handles retries.

**Rationale**: Provider is stateless, orchestrator has context about workflow state. Keeps provider simple.

## 6. Testing Strategy

### Unit Tests (Mock Provider)

**Test Cases**:

- Create instance → verify ID and IP returned
- Create with spot flag → verify flag ignored (mock doesn't simulate spot)
- Get status → verify state transitions
- Terminate instance → verify state changes to "terminated"
- Terminate non-existent instance → verify no error (idempotent)
- Validate credentials → always succeeds

**Coverage Target**: 90%+ (mock is simple, should be near 100%)

### Integration Tests (Real Providers)

**Prerequisites**:

- Cloud credentials in environment variables:
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
  - `DO_API_TOKEN`, `DO_REGION`
  - `HETZNER_API_TOKEN`, `HETZNER_LOCATION`
- Tests are skipped if credentials not present (use `t.Skip()`)

**Test Cases** (per provider):

1. **ValidateCredentials**: Verify valid creds accepted, invalid rejected
2. **CreateInstance → GetStatus → Terminate**:
   - Create small amd64 instance
   - Poll GetStatus until Ready=true
   - Verify publicIP assigned
   - Terminate instance
   - Verify state changes to "terminated"
3. **Architecture Support**:
   - Create small arm64 instance (or verify warning for DigitalOcean)
   - Terminate
4. **Spot Instance** (AWS only):
   - Create with SpotInstance=true
   - Verify instance created (on-demand or spot)
   - Terminate
5. **Error Handling**:
   - Invalid credentials → ErrInvalidCredentials
   - Invalid region → ErrInvalidInput
   - Get non-existent instance → ErrInstanceNotFound

**Test Isolation**:

- Tag instances with `stagely_test=true`
- Cleanup function deletes all test instances on teardown
- Use unique tag per test run to avoid conflicts

**Coverage Target**: 70%+ (integration tests cover happy path + major errors)

### Edge Cases

1. **Public IP not assigned**: AWS may delay IP assignment
   - Test: Verify polling timeout works (mock slow assignment)
2. **Spot unavailable**: AWS may reject spot request
   - Test: Verify fallback to on-demand (or clear error)
3. **Quota exceeded**: Provider returns quota error
   - Test: Verify ErrQuotaExceeded returned
4. **Invalid region**: Provider doesn't support region
   - Test: Verify ErrInvalidInput returned
5. **Concurrent creates**: Multiple goroutines create instances
   - Test: Verify thread-safety, no race conditions (use `-race` flag)

## 7. Implementation Considerations

### Potential Challenges

1. **AMI ID Management** (AWS):
   - AMI IDs vary by region (us-east-1 vs eu-west-1)
   - Solution: Hardcode for MVP, use SSM Parameter Store later
   - Document in provider code which AMIs are used

2. **Rate Limiting**:
   - Cloud APIs have rate limits (AWS: 20 req/sec, DO: 5000/hr, Hetzner: unknown)
   - Solution: Don't implement rate limiting in provider (orchestrator handles concurrency)
   - Document recommended limits in provider comments

3. **Credential Rotation**:
   - Users may rotate API keys
   - Solution: Provider validates on each use (no caching of auth state)
   - Registry caches provider instance, not credentials validity

4. **Timeout Handling**:
   - API calls may hang indefinitely
   - Solution: Require `context.Context` in all methods, enforce timeouts in orchestrator
   - Provider respects context cancellation

5. **Testing Costs**:
   - Integration tests cost money (instances are billed by second/hour)
   - Solution: Use smallest instance sizes, aggressive cleanup, tag for tracking
   - Document expected test costs in README (~$0.10 per test run)

### Areas Needing Special Attention

1. **Public IP Polling** (AWS):
   - Must poll `DescribeInstances` until IP assigned
   - Need exponential backoff to avoid rate limits
   - Need timeout to avoid infinite wait

2. **Error Message Clarity**:
   - Wrap errors with context (which operation failed, which provider)
   - Include instanceID in errors for debugging
   - Don't leak sensitive info (API keys) in error messages

3. **Thread Safety**:
   - Registry uses RWMutex for concurrent access
   - Provider implementations must be thread-safe (SDK clients handle this)
   - Test with `-race` flag

## 8. Future Enhancements

### Features Intentionally Deferred

1. **Multi-Region Support**:
   - Provisioning in multiple regions simultaneously
   - Reason: Adds complexity (region selection logic), not needed for MVP
   - Extension point: Add `regions []string` to InstanceSpec

2. **Auto-Scaling**:
   - Automatically scale builder VMs based on queue depth
   - Reason: Requires metrics, scaling logic, complexity
   - Extension point: Orchestrator can call CreateInstance multiple times

3. **Cost Tracking**:
   - Track actual cloud spend per instance
   - Reason: Requires polling billing APIs, complex attribution
   - Extension point: Add `GetInstanceCost(instanceID)` method

4. **Custom Networking**:
   - VPC, subnets, security groups
   - Reason: Adds configuration complexity, default networking is sufficient
   - Extension point: Add `NetworkConfig` field to InstanceSpec

5. **Volume Management**:
   - Attach additional EBS/volumes
   - Reason: Ephemeral VMs use instance storage, no persistence needed
   - Extension point: Add `VolumeSpec` to InstanceSpec

6. **GPU Support**:
   - Provision GPU instances for ML workloads
   - Reason: High cost, niche use case for preview environments
   - Extension point: Add `gpu bool` to InstanceSpec, map to p2/p3 instances

### Extension Points

The design includes several extension points for future enhancements:

- **Interface method additions**: Add methods without breaking existing implementations (add defaults)
- **InstanceSpec fields**: Add optional fields without breaking existing code
- **Provider implementations**: Add new providers by implementing interface
- **Registry plugins**: Custom provider loading from plugins

### Migration Considerations

If we need to change provider implementations:

1. **Version interfaces**: `CloudProviderV2` with extended methods
2. **Adapter pattern**: Wrap old providers in new interface
3. **Feature flags**: Gradually roll out new providers to subset of users
4. **Database migration**: Add `provider_version` column to cloud_provider table

## 9. Summary

This design provides a clean, testable, and extensible cloud provider abstraction for Stagely. Key strengths:

- **Simple interface**: 4 methods, clear contracts
- **Provider-agnostic**: Size/arch abstraction hides provider details
- **Testable**: Mock provider for fast tests, integration tests for real APIs
- **Secure**: Credentials encrypted at rest, decrypted on demand
- **Extensible**: Easy to add new providers or features

The design follows Go best practices (interfaces, error wrapping, context cancellation) and integrates cleanly with existing Phase 0 infrastructure (crypto, config, database).

**Ready for planning phase**: This design can be broken down into bite-sized implementation tasks with clear verification steps.
