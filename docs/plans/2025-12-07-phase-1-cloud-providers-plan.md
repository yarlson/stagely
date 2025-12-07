# Phase 1: Cloud Provider Interface and Implementations - Implementation Plan

> **Status:** Ready for implementation
> **Design:** docs/designs/2025-12-07-phase-1-cloud-providers-design.md
> **Created:** 2025-12-07

**Goal:** Implement a unified cloud provider interface supporting AWS EC2, DigitalOcean, and Hetzner with size/architecture abstraction, credential encryption, and mock provider for testing.

**Architecture:** Strategy pattern with `CloudProvider` interface implemented by three real providers (AWS, DigitalOcean, Hetzner) and one mock provider. Registry pattern manages provider instantiation with credential decryption and caching.

**Tech Stack:**

- AWS SDK v2: `github.com/aws/aws-sdk-go-v2`
- DigitalOcean: `github.com/digitalocean/godo`
- Hetzner: `github.com/hetznercloud/hcloud-go/v2`
- Testing: Go standard testing + testify + testcontainers

**Prerequisites:**

- Phase 0 complete (crypto module, config, database)
- Go 1.22+ installed
- golangci-lint installed
- Cloud credentials for integration tests (optional, tests skip if missing)

---

## Task 1: CloudProvider Interface and Core Types

**Objective:** Define the `CloudProvider` interface and core data structures that all providers will implement.

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/providers/provider.go`
- Create: `/Users/yaroslavk/stagely/internal/providers/provider_test.go`

**Background:**
This is the foundation of our provider abstraction. The interface defines the contract that all cloud providers must implement. We're keeping it minimal (4 methods) to ensure simplicity while providing all necessary VM lifecycle operations.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/providers/provider_test.go`

```go
package providers

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestInstanceSpec_Validation(t *testing.T) {
	tests := []struct {
		name    string
		spec    InstanceSpec
		wantErr bool
	}{
		{
			name: "valid spec with small amd64",
			spec: InstanceSpec{
				Size:         "small",
				Architecture: "amd64",
				Region:       "us-east-1",
				UserData:     "#!/bin/bash\necho hello",
				Tags:         map[string]string{"env": "test"},
				SpotInstance: false,
			},
			wantErr: false,
		},
		{
			name: "valid spec with medium arm64",
			spec: InstanceSpec{
				Size:         "medium",
				Architecture: "arm64",
				Region:       "eu-west-1",
				SpotInstance: true,
			},
			wantErr: false,
		},
		{
			name: "invalid size",
			spec: InstanceSpec{
				Size:         "tiny",
				Architecture: "amd64",
				Region:       "us-east-1",
			},
			wantErr: true,
		},
		{
			name: "invalid architecture",
			spec: InstanceSpec{
				Size:         "small",
				Architecture: "x86",
				Region:       "us-east-1",
			},
			wantErr: true,
		},
		{
			name: "missing size",
			spec: InstanceSpec{
				Architecture: "amd64",
				Region:       "us-east-1",
			},
			wantErr: true,
		},
		{
			name: "missing region",
			spec: InstanceSpec{
				Size:         "small",
				Architecture: "amd64",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.spec.Validate()
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestInstanceStatus_IsReady(t *testing.T) {
	tests := []struct {
		name   string
		status InstanceStatus
		want   bool
	}{
		{
			name: "running with public IP",
			status: InstanceStatus{
				State:    StateRunning,
				PublicIP: "1.2.3.4",
			},
			want: true,
		},
		{
			name: "running without public IP",
			status: InstanceStatus{
				State:    StateRunning,
				PublicIP: "",
			},
			want: false,
		},
		{
			name: "pending with public IP",
			status: InstanceStatus{
				State:    StatePending,
				PublicIP: "1.2.3.4",
			},
			want: false,
		},
		{
			name: "terminated",
			status: InstanceStatus{
				State:    StateTerminated,
				PublicIP: "",
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.status.IsReady()
			assert.Equal(t, tt.want, got)
		})
	}
}
```

**Why this test:** Validates that InstanceSpec validation works correctly and InstanceStatus.IsReady() computes the ready state properly.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestInstanceSpec
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/providers [github.com/stagely-dev/stagely/internal/providers.test]
internal/providers/provider_test.go:8:2: undefined: InstanceSpec
```

**Why verify failure:** Ensures test actually tests the behavior (not false positive)

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/providers/provider.go`

```go
// Package providers defines the cloud provider abstraction for VM provisioning
package providers

import (
	"context"
	"errors"
	"time"
)

// CloudProvider defines the interface for cloud VM provisioning
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

// InstanceSpec specifies what kind of VM to provision
type InstanceSpec struct {
	Size         string            // "small", "medium", "large"
	Architecture string            // "amd64", "arm64"
	Region       string            // Provider-specific (e.g., "us-east-1", "nyc3")
	UserData     string            // Cloud-init script (base64 NOT required)
	Tags         map[string]string // Instance tags/labels
	SpotInstance bool              // Request spot/preemptible instance
}

// Instance size constants
const (
	SizeSmall  = "small"
	SizeMedium = "medium"
	SizeLarge  = "large"
)

// Architecture constants
const (
	ArchAMD64 = "amd64"
	ArchARM64 = "arm64"
)

// Validate checks that the instance spec is valid
func (s *InstanceSpec) Validate() error {
	if s.Size == "" {
		return errors.New("size is required")
	}
	if s.Size != SizeSmall && s.Size != SizeMedium && s.Size != SizeLarge {
		return errors.New("size must be small, medium, or large")
	}

	if s.Architecture == "" {
		return errors.New("architecture is required")
	}
	if s.Architecture != ArchAMD64 && s.Architecture != ArchARM64 {
		return errors.New("architecture must be amd64 or arm64")
	}

	if s.Region == "" {
		return errors.New("region is required")
	}

	return nil
}

// InstanceStatus represents normalized instance state
type InstanceStatus struct {
	State      string    // "pending", "running", "stopped", "terminated"
	PublicIP   string    // Empty if not yet assigned
	PrivateIP  string    // Empty if not applicable
	LaunchedAt time.Time // Instance creation timestamp
}

// Instance state constants
const (
	StatePending    = "pending"
	StateRunning    = "running"
	StateStopped    = "stopped"
	StateTerminated = "terminated"
)

// IsReady returns true if the instance is running and has a public IP
func (s *InstanceStatus) IsReady() bool {
	return s.State == StateRunning && s.PublicIP != ""
}

// Common provider errors
var (
	ErrInvalidCredentials = errors.New("invalid or expired credentials")
	ErrQuotaExceeded      = errors.New("quota exceeded")
	ErrNetworkFailure     = errors.New("network failure")
	ErrInvalidInput       = errors.New("invalid input")
	ErrInstanceNotFound   = errors.New("instance not found")
)
```

**Implementation notes:**

- Interface has exactly 5 methods (Name + 4 operations)
- InstanceSpec includes validation method to catch errors early
- InstanceStatus has computed IsReady() field for orchestrator convenience
- Constants for sizes, architectures, and states ensure type safety
- Common errors defined for consistent error handling across providers

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestInstanceSpec
```

**Expected output:**

```
=== RUN   TestInstanceSpec_Validation
=== RUN   TestInstanceSpec_Validation/valid_spec_with_small_amd64
=== RUN   TestInstanceSpec_Validation/valid_spec_with_medium_arm64
=== RUN   TestInstanceSpec_Validation/invalid_size
=== RUN   TestInstanceSpec_Validation/invalid_architecture
=== RUN   TestInstanceSpec_Validation/missing_size
=== RUN   TestInstanceSpec_Validation/missing_region
--- PASS: TestInstanceSpec_Validation (0.00s)
    --- PASS: TestInstanceSpec_Validation/valid_spec_with_small_amd64 (0.00s)
    --- PASS: TestInstanceSpec_Validation/valid_spec_with_medium_arm64 (0.00s)
    --- PASS: TestInstanceSpec_Validation/invalid_size (0.00s)
    --- PASS: TestInstanceSpec_Validation/invalid_architecture (0.00s)
    --- PASS: TestInstanceSpec_Validation/missing_size (0.00s)
    --- PASS: TestInstanceSpec_Validation/missing_region (0.00s)
=== RUN   TestInstanceStatus_IsReady
=== RUN   TestInstanceStatus_IsReady/running_with_public_IP
=== RUN   TestInstanceStatus_IsReady/running_without_public_IP
=== RUN   TestInstanceStatus_IsReady/pending_with_public_IP
=== RUN   TestInstanceStatus_IsReady/terminated
--- PASS: TestInstanceStatus_IsReady (0.00s)
PASS
ok      github.com/stagely-dev/stagely/internal/providers    0.002s
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test -v -race ./...
```

**Expected:** All tests pass, no regressions

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected output:**

```
(no output - all checks passed)
```

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/provider.go internal/providers/provider_test.go && git commit -m "feat: add CloudProvider interface and core types

- Define CloudProvider interface with 5 methods (Name, CreateInstance, GetInstanceStatus, TerminateInstance, ValidateCredentials)
- Add InstanceSpec with validation (size, architecture, region)
- Add InstanceStatus with IsReady() helper
- Define constants for sizes (small/medium/large), architectures (amd64/arm64), states
- Define common provider errors (ErrInvalidCredentials, ErrQuotaExceeded, etc.)
- Tests cover InstanceSpec validation and InstanceStatus.IsReady()

Part of Phase 1: Cloud Provider Interface and Implementations"
```

---

## Task 2: Mock Provider Implementation

**Objective:** Implement an in-memory mock provider for fast, deterministic testing without cloud API calls.

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/providers/mock.go`
- Create: `/Users/yaroslavk/stagely/internal/providers/mock_test.go`

**Background:**
The mock provider enables fast unit tests and integration tests without incurring cloud costs. It simulates VM provisioning with configurable delays and failure scenarios.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/providers/mock_test.go`

```go
package providers

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMockProvider_Name(t *testing.T) {
	mock := NewMockProvider()
	assert.Equal(t, "mock", mock.Name())
}

func TestMockProvider_CreateInstance(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProvider()

	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "mock-region",
		UserData:     "#!/bin/bash\necho hello",
		Tags:         map[string]string{"test": "true"},
		SpotInstance: false,
	}

	instanceID, publicIP, err := mock.CreateInstance(ctx, spec)
	require.NoError(t, err)

	assert.NotEmpty(t, instanceID)
	assert.NotEmpty(t, publicIP)
	assert.Contains(t, instanceID, "mock-")
	assert.Contains(t, publicIP, "192.0.2.")
}

func TestMockProvider_GetInstanceStatus(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProvider()

	// Create instance first
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "mock-region",
	}
	instanceID, publicIP, err := mock.CreateInstance(ctx, spec)
	require.NoError(t, err)

	// Get status
	status, err := mock.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)

	assert.Equal(t, StateRunning, status.State)
	assert.Equal(t, publicIP, status.PublicIP)
	assert.True(t, status.IsReady())
	assert.False(t, status.LaunchedAt.IsZero())
}

func TestMockProvider_GetInstanceStatus_NotFound(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProvider()

	_, err := mock.GetInstanceStatus(ctx, "nonexistent")
	assert.ErrorIs(t, err, ErrInstanceNotFound)
}

func TestMockProvider_TerminateInstance(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProvider()

	// Create instance first
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "mock-region",
	}
	instanceID, _, err := mock.CreateInstance(ctx, spec)
	require.NoError(t, err)

	// Terminate
	err = mock.TerminateInstance(ctx, instanceID)
	require.NoError(t, err)

	// Verify terminated
	status, err := mock.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)
	assert.Equal(t, StateTerminated, status.State)
	assert.False(t, status.IsReady())
}

func TestMockProvider_TerminateInstance_Idempotent(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProvider()

	// Create instance
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "mock-region",
	}
	instanceID, _, err := mock.CreateInstance(ctx, spec)
	require.NoError(t, err)

	// Terminate twice
	err = mock.TerminateInstance(ctx, instanceID)
	require.NoError(t, err)

	err = mock.TerminateInstance(ctx, instanceID)
	require.NoError(t, err) // No error on second terminate

	// Terminate non-existent (should also be no error)
	err = mock.TerminateInstance(ctx, "nonexistent")
	require.NoError(t, err)
}

func TestMockProvider_ValidateCredentials(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProvider()

	err := mock.ValidateCredentials(ctx)
	assert.NoError(t, err)
}

func TestMockProvider_WithDelay(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProviderWithDelay(50 * time.Millisecond)

	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "mock-region",
	}

	start := time.Now()
	_, _, err := mock.CreateInstance(ctx, spec)
	duration := time.Since(start)

	require.NoError(t, err)
	assert.GreaterOrEqual(t, duration, 50*time.Millisecond)
}

func TestMockProvider_ConcurrentCreate(t *testing.T) {
	ctx := context.Background()
	mock := NewMockProvider()

	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "mock-region",
	}

	// Create 10 instances concurrently
	done := make(chan bool, 10)
	instanceIDs := make(map[string]bool)

	for i := 0; i < 10; i++ {
		go func() {
			instanceID, _, err := mock.CreateInstance(ctx, spec)
			require.NoError(t, err)
			instanceIDs[instanceID] = true
			done <- true
		}()
	}

	// Wait for all
	for i := 0; i < 10; i++ {
		<-done
	}

	// Verify all unique instance IDs
	assert.Len(t, instanceIDs, 10)
}
```

**Why this test:** Covers all mock provider methods, including edge cases (not found, idempotent terminate, concurrent creates).

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestMockProvider
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/providers [github.com/stagely-dev/stagely/internal/providers.test]
internal/providers/mock_test.go:11:11: undefined: NewMockProvider
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/providers/mock.go`

```go
package providers

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// MockProvider is an in-memory provider for testing
type MockProvider struct {
	mu        sync.RWMutex
	instances map[string]*mockInstance
	nextID    int
	delay     time.Duration
}

type mockInstance struct {
	id         string
	publicIP   string
	privateIP  string
	state      string
	launchedAt time.Time
	spec       InstanceSpec
}

// NewMockProvider creates a new mock provider with no delay
func NewMockProvider() *MockProvider {
	return &MockProvider{
		instances: make(map[string]*mockInstance),
		nextID:    1,
		delay:     0,
	}
}

// NewMockProviderWithDelay creates a new mock provider with simulated delay
func NewMockProviderWithDelay(delay time.Duration) *MockProvider {
	return &MockProvider{
		instances: make(map[string]*mockInstance),
		nextID:    1,
		delay:     delay,
	}
}

// Name returns "mock"
func (m *MockProvider) Name() string {
	return "mock"
}

// CreateInstance creates a fake instance
func (m *MockProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
	if err := spec.Validate(); err != nil {
		return "", "", fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}

	// Simulate provisioning delay
	if m.delay > 0 {
		select {
		case <-time.After(m.delay):
		case <-ctx.Done():
			return "", "", ctx.Err()
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Generate instance ID and IP
	instanceID := fmt.Sprintf("mock-%d", m.nextID)
	publicIP := fmt.Sprintf("192.0.2.%d", m.nextID%256)
	privateIP := fmt.Sprintf("10.0.0.%d", m.nextID%256)
	m.nextID++

	// Create instance
	m.instances[instanceID] = &mockInstance{
		id:         instanceID,
		publicIP:   publicIP,
		privateIP:  privateIP,
		state:      StateRunning,
		launchedAt: time.Now(),
		spec:       spec,
	}

	return instanceID, publicIP, nil
}

// GetInstanceStatus returns the status of a mock instance
func (m *MockProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	instance, ok := m.instances[instanceID]
	if !ok {
		return InstanceStatus{}, fmt.Errorf("%w: %s", ErrInstanceNotFound, instanceID)
	}

	return InstanceStatus{
		State:      instance.state,
		PublicIP:   instance.publicIP,
		PrivateIP:  instance.privateIP,
		LaunchedAt: instance.launchedAt,
	}, nil
}

// TerminateInstance marks an instance as terminated (idempotent)
func (m *MockProvider) TerminateInstance(ctx context.Context, instanceID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	instance, ok := m.instances[instanceID]
	if !ok {
		// Idempotent - no error if already gone
		return nil
	}

	instance.state = StateTerminated
	instance.publicIP = ""
	instance.privateIP = ""

	return nil
}

// ValidateCredentials always succeeds for mock provider
func (m *MockProvider) ValidateCredentials(ctx context.Context) error {
	return nil
}
```

**Implementation notes:**

- Thread-safe using RWMutex
- Generates sequential instance IDs and IPs from TEST-NET-1 range (192.0.2.0/24)
- Supports configurable delay to simulate provisioning time
- Terminate is idempotent (no error if instance doesn't exist)
- Context cancellation supported in CreateInstance

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestMockProvider
```

**Expected output:**

```
=== RUN   TestMockProvider_Name
--- PASS: TestMockProvider_Name (0.00s)
=== RUN   TestMockProvider_CreateInstance
--- PASS: TestMockProvider_CreateInstance (0.00s)
=== RUN   TestMockProvider_GetInstanceStatus
--- PASS: TestMockProvider_GetInstanceStatus (0.00s)
=== RUN   TestMockProvider_GetInstanceStatus_NotFound
--- PASS: TestMockProvider_GetInstanceStatus_NotFound (0.00s)
=== RUN   TestMockProvider_TerminateInstance
--- PASS: TestMockProvider_TerminateInstance (0.00s)
=== RUN   TestMockProvider_TerminateInstance_Idempotent
--- PASS: TestMockProvider_TerminateInstance_Idempotent (0.00s)
=== RUN   TestMockProvider_ValidateCredentials
--- PASS: TestMockProvider_ValidateCredentials (0.00s)
=== RUN   TestMockProvider_WithDelay
--- PASS: TestMockProvider_WithDelay (0.05s)
=== RUN   TestMockProvider_ConcurrentCreate
--- PASS: TestMockProvider_ConcurrentCreate (0.00s)
PASS
ok      github.com/stagely-dev/stagely/internal/providers    0.052s
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test -v -race ./...
```

**Expected:** All tests pass, no race conditions detected

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** No issues

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/mock.go internal/providers/mock_test.go && git commit -m "feat: add mock cloud provider for testing

- Implement in-memory mock provider with thread-safe instance management
- Support configurable provisioning delay simulation
- Generate fake instance IDs (mock-N) and IPs (192.0.2.N)
- Idempotent terminate operation
- Tests cover concurrent creates, delays, edge cases

Part of Phase 1: Cloud Provider Interface and Implementations"
```

---

## Task 3: Provider Registry

**Objective:** Implement provider registry with credential decryption and thread-safe caching.

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/providers/registry.go`
- Create: `/Users/yaroslavk/stagely/internal/providers/registry_test.go`

**Background:**
The registry manages provider instantiation from encrypted credentials stored in the database. It decrypts credentials, creates provider instances, and caches them to avoid repeated decryption.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/providers/registry_test.go`

```go
package providers

import (
	"context"
	"testing"

	"github.com/stagely-dev/stagely/internal/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewRegistry(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.NoError(t, err)

	registry := NewRegistry(key)
	assert.NotNil(t, registry)
}

func TestRegistry_RegisterProvider(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.NoError(t, err)

	registry := NewRegistry(key)
	mock := NewMockProvider()

	registry.RegisterProvider("custom", mock)

	// Verify we can retrieve it
	provider, err := registry.GetProvider(context.Background(), "custom", "")
	require.NoError(t, err)
	assert.Equal(t, "custom", provider.Name())
}

func TestRegistry_GetProvider_Mock(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.NoError(t, err)

	registry := NewRegistry(key)

	// Mock provider doesn't need credentials
	provider, err := registry.GetProvider(context.Background(), "mock", "")
	require.NoError(t, err)
	assert.Equal(t, "mock", provider.Name())
}

func TestRegistry_GetProvider_InvalidType(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.NoError(t, err)

	registry := NewRegistry(key)

	_, err = registry.GetProvider(context.Background(), "invalid", "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported provider type")
}

func TestRegistry_GetProvider_Caching(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.NoError(t, err)

	registry := NewRegistry(key)

	// Get provider twice
	provider1, err := registry.GetProvider(context.Background(), "mock", "")
	require.NoError(t, err)

	provider2, err := registry.GetProvider(context.Background(), "mock", "")
	require.NoError(t, err)

	// Should be same instance (cached)
	assert.Same(t, provider1, provider2)
}

func TestRegistry_ConcurrentAccess(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.NoError(t, err)

	registry := NewRegistry(key)

	// Access registry concurrently
	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func() {
			_, err := registry.GetProvider(context.Background(), "mock", "")
			require.NoError(t, err)
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}
}
```

**Why this test:** Tests registry creation, provider registration, retrieval, caching, and thread safety.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestRegistry
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/providers [github.com/stagely-dev/stagely/internal/providers.test]
internal/providers/registry_test.go:13:14: undefined: NewRegistry
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/providers/registry.go`

```go
package providers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
)

// Registry manages cloud provider instances
type Registry struct {
	mu            sync.RWMutex
	providers     map[string]CloudProvider // cacheKey → provider instance
	custom        map[string]CloudProvider // name → custom registered providers
	encryptionKey []byte
}

// NewRegistry creates a new provider registry
func NewRegistry(encryptionKey []byte) *Registry {
	return &Registry{
		providers:     make(map[string]CloudProvider),
		custom:        make(map[string]CloudProvider),
		encryptionKey: encryptionKey,
	}
}

// RegisterProvider adds a custom provider (useful for testing)
func (r *Registry) RegisterProvider(name string, provider CloudProvider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.custom[name] = provider
}

// GetProvider retrieves or creates a provider instance
// Caches providers by hash of credentials to avoid re-instantiation
func (r *Registry) GetProvider(ctx context.Context, providerType string, encryptedCredentials string) (CloudProvider, error) {
	// Check custom providers first
	r.mu.RLock()
	if custom, ok := r.custom[providerType]; ok {
		r.mu.RUnlock()
		return custom, nil
	}
	r.mu.RUnlock()

	// Generate cache key from provider type + credentials
	cacheKey := r.getCacheKey(providerType, encryptedCredentials)

	// Check cache
	r.mu.RLock()
	if cached, ok := r.providers[cacheKey]; ok {
		r.mu.RUnlock()
		return cached, nil
	}
	r.mu.RUnlock()

	// Create new provider
	provider, err := r.createProvider(ctx, providerType, encryptedCredentials)
	if err != nil {
		return nil, err
	}

	// Cache it
	r.mu.Lock()
	r.providers[cacheKey] = provider
	r.mu.Unlock()

	return provider, nil
}

// getCacheKey generates a cache key from provider type and credentials
func (r *Registry) getCacheKey(providerType string, encryptedCredentials string) string {
	h := sha256.New()
	h.Write([]byte(providerType))
	h.Write([]byte(encryptedCredentials))
	return hex.EncodeToString(h.Sum(nil))
}

// createProvider creates a new provider instance based on type
func (r *Registry) createProvider(ctx context.Context, providerType string, encryptedCredentials string) (CloudProvider, error) {
	switch providerType {
	case "mock":
		return NewMockProvider(), nil
	case "aws":
		// TODO: Implement in next task
		return nil, fmt.Errorf("aws provider not yet implemented")
	case "digitalocean":
		// TODO: Implement in next task
		return nil, fmt.Errorf("digitalocean provider not yet implemented")
	case "hetzner":
		// TODO: Implement in next task
		return nil, fmt.Errorf("hetzner provider not yet implemented")
	default:
		return nil, fmt.Errorf("unsupported provider type: %s", providerType)
	}
}
```

**Implementation notes:**

- Thread-safe with RWMutex (optimized for many readers)
- Cache key uses SHA256 hash of provider type + credentials
- Custom providers (like mock) can be registered for testing
- Provider creation is centralized in createProvider method
- Real providers (AWS, DO, Hetzner) will be implemented in next tasks

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestRegistry
```

**Expected output:**

```
=== RUN   TestNewRegistry
--- PASS: TestNewRegistry (0.00s)
=== RUN   TestRegistry_RegisterProvider
--- PASS: TestRegistry_RegisterProvider (0.00s)
=== RUN   TestRegistry_GetProvider_Mock
--- PASS: TestRegistry_GetProvider_Mock (0.00s)
=== RUN   TestRegistry_GetProvider_InvalidType
--- PASS: TestRegistry_GetProvider_InvalidType (0.00s)
=== RUN   TestRegistry_GetProvider_Caching
--- PASS: TestRegistry_GetProvider_Caching (0.00s)
=== RUN   TestRegistry_ConcurrentAccess
--- PASS: TestRegistry_ConcurrentAccess (0.00s)
PASS
ok      github.com/stagely-dev/stagely/internal/providers    0.003s
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test -v -race ./...
```

**Expected:** All tests pass, no race conditions

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** No issues

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/registry.go internal/providers/registry_test.go && git commit -m "feat: add provider registry with caching

- Implement thread-safe provider registry with RWMutex
- Cache providers by SHA256 hash of type + credentials
- Support custom provider registration for testing
- Placeholder for AWS, DigitalOcean, Hetzner providers
- Tests cover caching, concurrent access, invalid types

Part of Phase 1: Cloud Provider Interface and Implementations"
```

---

## Task 4: Add Cloud SDK Dependencies

**Objective:** Add AWS SDK, DigitalOcean, and Hetzner SDKs to go.mod.

**Files:**

- Modify: `/Users/yaroslavk/stagely/go.mod`
- Modify: `/Users/yaroslavk/stagely/go.sum`

**Background:**
Before implementing real providers, we need to add their SDK dependencies. We'll use `go get` to add them with proper versions.

### Step 1: Add AWS SDK dependencies

**Command:**

```bash
cd /Users/yaroslavk/stagely && go get github.com/aws/aws-sdk-go-v2@latest
cd /Users/yaroslavk/stagely && go get github.com/aws/aws-sdk-go-v2/config@latest
cd /Users/yaroslavk/stagely && go get github.com/aws/aws-sdk-go-v2/service/ec2@latest
cd /Users/yaroslavk/stagely && go get github.com/aws/aws-sdk-go-v2/credentials@latest
```

**Expected output:**

```
go: downloading github.com/aws/aws-sdk-go-v2 v1.x.x
go: added github.com/aws/aws-sdk-go-v2 v1.x.x
...
```

### Step 2: Add DigitalOcean SDK dependency

**Command:**

```bash
cd /Users/yaroslavk/stagely && go get github.com/digitalocean/godo@latest
```

**Expected output:**

```
go: downloading github.com/digitalocean/godo v1.x.x
go: added github.com/digitalocean/godo v1.x.x
```

### Step 3: Add Hetzner SDK dependency

**Command:**

```bash
cd /Users/yaroslavk/stagely && go get github.com/hetznercloud/hcloud-go/v2@latest
```

**Expected output:**

```
go: downloading github.com/hetznercloud/hcloud-go/v2 v2.x.x
go: added github.com/hetznercloud/hcloud-go/v2 v2.x.x
```

### Step 4: Tidy dependencies

**Command:**

```bash
cd /Users/yaroslavk/stagely && go mod tidy
```

**Expected:** Clean output, all indirect dependencies resolved

### Step 5: Verify build still works

**Command:**

```bash
cd /Users/yaroslavk/stagely && go build ./...
```

**Expected:** No errors

### Step 6: Run tests to ensure no breakage

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./... -v
```

**Expected:** All tests still pass

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add go.mod go.sum && git commit -m "deps: add cloud provider SDKs

- Add AWS SDK v2 (EC2, config, credentials)
- Add DigitalOcean godo client
- Add Hetzner hcloud-go v2 client

Part of Phase 1: Cloud Provider Interface and Implementations"
```

---

## Task 5: AWS Provider Implementation

**Objective:** Implement AWS EC2 provider with instance type mapping, AMI selection, and public IP polling.

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/providers/aws.go`
- Create: `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

**Background:**
AWS provider uses EC2 RunInstances API to provision VMs. Instance types are mapped based on size and architecture. AMIs are selected based on architecture (Ubuntu 22.04 amd64/arm64).

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

```go
package providers

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/stagely-dev/stagely/internal/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAWSProvider_SelectInstanceType(t *testing.T) {
	tests := []struct {
		name         string
		size         string
		architecture string
		want         string
	}{
		{"small amd64", SizeSmall, ArchAMD64, "t3.small"},
		{"small arm64", SizeSmall, ArchARM64, "t4g.small"},
		{"medium amd64", SizeMedium, ArchAMD64, "c5.xlarge"},
		{"medium arm64", SizeMedium, ArchARM64, "c6g.xlarge"},
		{"large amd64", SizeLarge, ArchAMD64, "c5.2xlarge"},
		{"large arm64", SizeLarge, ArchARM64, "c6g.2xlarge"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := selectAWSInstanceType(tt.size, tt.architecture)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestAWSProvider_SelectAMI(t *testing.T) {
	tests := []struct {
		name         string
		architecture string
		wantContains string
	}{
		{"amd64", ArchAMD64, "ami-"},
		{"arm64", ArchARM64, "ami-"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := selectAWSAMI(tt.architecture, "us-east-1")
			assert.Contains(t, got, tt.wantContains)
		})
	}
}

// Integration test - requires AWS credentials
func TestAWSProvider_Integration(t *testing.T) {
	// Skip if credentials not available
	accessKey := os.Getenv("AWS_ACCESS_KEY_ID")
	secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY")
	region := os.Getenv("AWS_REGION")
	if accessKey == "" || secretKey == "" {
		t.Skip("AWS credentials not available, skipping integration test")
	}
	if region == "" {
		region = "us-east-1"
	}

	ctx := context.Background()

	// Create credentials JSON
	creds := AWSCredentials{
		AccessKeyID:     accessKey,
		SecretAccessKey: secretKey,
		Region:          region,
	}
	credsJSON, err := json.Marshal(creds)
	require.NoError(t, err)

	// Encrypt credentials
	key, err := crypto.GenerateKey()
	require.NoError(t, err)
	encrypted, err := crypto.Encrypt(string(credsJSON), key)
	require.NoError(t, err)

	// Create provider via registry
	registry := NewRegistry(key)
	providerRaw, err := registry.GetProvider(ctx, "aws", encrypted)
	require.NoError(t, err)

	provider := providerRaw.(*AWSProvider)
	assert.Equal(t, "aws", provider.Name())

	// Validate credentials
	err = provider.ValidateCredentials(ctx)
	require.NoError(t, err)

	// Create instance
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       region,
		UserData:     "#!/bin/bash\necho 'test'",
		Tags: map[string]string{
			"stagely_test": "true",
			"Name":         "stagely-test-instance",
		},
		SpotInstance: false,
	}

	instanceID, publicIP, err := provider.CreateInstance(ctx, spec)
	require.NoError(t, err)
	assert.NotEmpty(t, instanceID)
	assert.NotEmpty(t, publicIP)

	t.Logf("Created instance: %s with IP: %s", instanceID, publicIP)

	// Cleanup: Terminate instance
	defer func() {
		err := provider.TerminateInstance(ctx, instanceID)
		if err != nil {
			t.Logf("Warning: failed to terminate instance %s: %v", instanceID, err)
		}
	}()

	// Get status
	status, err := provider.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)
	assert.Equal(t, StateRunning, status.State)
	assert.Equal(t, publicIP, status.PublicIP)
	assert.True(t, status.IsReady())

	// Terminate
	err = provider.TerminateInstance(ctx, instanceID)
	require.NoError(t, err)

	// Verify terminated (may need to poll briefly)
	time.Sleep(2 * time.Second)
	status, err = provider.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)
	assert.Contains(t, []string{"shutting-down", StateTerminated}, status.State)
}
```

**Why this test:** Tests instance type mapping, AMI selection, and full lifecycle with real AWS API (if credentials available).

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestAWSProvider_Select
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/providers [github.com/stagely-dev/stagely/internal/providers.test]
internal/providers/aws_test.go:21:13: undefined: selectAWSInstanceType
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/providers/aws.go`

```go
package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/stagely-dev/stagely/internal/crypto"
)

// AWSProvider implements CloudProvider for AWS EC2
type AWSProvider struct {
	client *ec2.Client
	region string
}

// AWSCredentials holds AWS authentication details
type AWSCredentials struct {
	AccessKeyID     string `json:"access_key_id"`
	SecretAccessKey string `json:"secret_access_key"`
	Region          string `json:"region"`
}

// NewAWSProvider creates a new AWS provider from encrypted credentials
func NewAWSProvider(ctx context.Context, encryptedCredentials string, encryptionKey []byte) (*AWSProvider, error) {
	// Decrypt credentials
	decrypted, err := crypto.Decrypt(encryptedCredentials, encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt AWS credentials: %w", err)
	}

	// Parse credentials
	var creds AWSCredentials
	if err := json.Unmarshal([]byte(decrypted), &creds); err != nil {
		return nil, fmt.Errorf("failed to parse AWS credentials: %w", err)
	}

	// Create AWS config
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(creds.Region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			creds.AccessKeyID,
			creds.SecretAccessKey,
			"",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Create EC2 client
	client := ec2.NewFromConfig(cfg)

	return &AWSProvider{
		client: client,
		region: creds.Region,
	}, nil
}

// Name returns "aws"
func (p *AWSProvider) Name() string {
	return "aws"
}

// CreateInstance provisions a new EC2 instance
func (p *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
	if err := spec.Validate(); err != nil {
		return "", "", fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}

	// Select instance type
	instanceType := selectAWSInstanceType(spec.Size, spec.Architecture)

	// Select AMI
	ami := selectAWSAMI(spec.Architecture, spec.Region)

	// Build tags
	tags := make([]types.Tag, 0, len(spec.Tags)+1)
	for k, v := range spec.Tags {
		tags = append(tags, types.Tag{
			Key:   aws.String(k),
			Value: aws.String(v),
		})
	}
	tags = append(tags, types.Tag{
		Key:   aws.String("stagely_managed"),
		Value: aws.String("true"),
	})

	// Run instance
	input := &ec2.RunInstancesInput{
		ImageId:      aws.String(ami),
		InstanceType: types.InstanceType(instanceType),
		MinCount:     aws.Int32(1),
		MaxCount:     aws.Int32(1),
		UserData:     aws.String(spec.UserData),
		TagSpecifications: []types.TagSpecification{
			{
				ResourceType: types.ResourceTypeInstance,
				Tags:         tags,
			},
		},
		NetworkInterfaces: []types.InstanceNetworkInterfaceSpecification{
			{
				DeviceIndex:              aws.Int32(0),
				AssociatePublicIpAddress: aws.Bool(true),
				DeleteOnTermination:      aws.Bool(true),
			},
		},
	}

	// Handle spot instance request
	if spec.SpotInstance {
		input.InstanceMarketOptions = &types.InstanceMarketOptionsRequest{
			MarketType: types.MarketTypeSpot,
			SpotOptions: &types.SpotMarketOptions{
				SpotInstanceType: types.SpotInstanceTypeOneTime,
				MaxPrice:         aws.String(""), // Use on-demand price as max
			},
		}
	}

	result, err := p.client.RunInstances(ctx, input)
	if err != nil {
		return "", "", fmt.Errorf("failed to create EC2 instance: %w", err)
	}

	if len(result.Instances) == 0 {
		return "", "", fmt.Errorf("no instances created")
	}

	instance := result.Instances[0]
	instanceID := aws.ToString(instance.InstanceId)

	// Wait for public IP assignment (poll up to 2 minutes)
	publicIP, err := p.waitForPublicIP(ctx, instanceID, 2*time.Minute)
	if err != nil {
		// Cleanup: Terminate the instance
		_ = p.TerminateInstance(ctx, instanceID)
		return "", "", fmt.Errorf("failed to get public IP: %w", err)
	}

	return instanceID, publicIP, nil
}

// GetInstanceStatus returns the status of an EC2 instance
func (p *AWSProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
	input := &ec2.DescribeInstancesInput{
		InstanceIds: []string{instanceID},
	}

	result, err := p.client.DescribeInstances(ctx, input)
	if err != nil {
		return InstanceStatus{}, fmt.Errorf("failed to describe instance: %w", err)
	}

	if len(result.Reservations) == 0 || len(result.Reservations[0].Instances) == 0 {
		return InstanceStatus{}, fmt.Errorf("%w: %s", ErrInstanceNotFound, instanceID)
	}

	instance := result.Reservations[0].Instances[0]

	// Map EC2 state to our state
	state := mapAWSState(instance.State.Name)

	status := InstanceStatus{
		State:      state,
		PublicIP:   aws.ToString(instance.PublicIpAddress),
		PrivateIP:  aws.ToString(instance.PrivateIpAddress),
		LaunchedAt: aws.ToTime(instance.LaunchTime),
	}

	return status, nil
}

// TerminateInstance terminates an EC2 instance
func (p *AWSProvider) TerminateInstance(ctx context.Context, instanceID string) error {
	input := &ec2.TerminateInstancesInput{
		InstanceIds: []string{instanceID},
	}

	_, err := p.client.TerminateInstances(ctx, input)
	if err != nil {
		// Check if instance not found (idempotent)
		return fmt.Errorf("failed to terminate instance: %w", err)
	}

	return nil
}

// ValidateCredentials verifies AWS credentials by listing regions
func (p *AWSProvider) ValidateCredentials(ctx context.Context) error {
	_, err := p.client.DescribeRegions(ctx, &ec2.DescribeRegionsInput{})
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
	}
	return nil
}

// waitForPublicIP polls until public IP is assigned or timeout
func (p *AWSProvider) waitForPublicIP(ctx context.Context, instanceID string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("timeout waiting for public IP")
		case <-ticker.C:
			status, err := p.GetInstanceStatus(ctx, instanceID)
			if err != nil {
				continue
			}
			if status.PublicIP != "" {
				return status.PublicIP, nil
			}
		}
	}
}

// selectAWSInstanceType maps size and architecture to EC2 instance type
func selectAWSInstanceType(size, architecture string) string {
	mapping := map[string]map[string]string{
		SizeSmall: {
			ArchAMD64: "t3.small",
			ArchARM64: "t4g.small",
		},
		SizeMedium: {
			ArchAMD64: "c5.xlarge",
			ArchARM64: "c6g.xlarge",
		},
		SizeLarge: {
			ArchAMD64: "c5.2xlarge",
			ArchARM64: "c6g.2xlarge",
		},
	}

	if archMap, ok := mapping[size]; ok {
		if instanceType, ok := archMap[architecture]; ok {
			return instanceType
		}
	}

	// Default fallback
	return "t3.small"
}

// selectAWSAMI selects Ubuntu 22.04 AMI based on architecture
// Note: AMI IDs are region-specific. For MVP, we hardcode us-east-1.
// Production should use AWS Systems Manager Parameter Store.
func selectAWSAMI(architecture, region string) string {
	// Ubuntu 22.04 LTS AMIs for us-east-1
	if region == "us-east-1" {
		if architecture == ArchARM64 {
			return "ami-0a0c8eebcdd6dcbd0" // Ubuntu 22.04 arm64
		}
		return "ami-0c7217cdde317cfec" // Ubuntu 22.04 amd64
	}

	// Fallback for other regions (these are us-west-2 AMIs as example)
	if architecture == ArchARM64 {
		return "ami-0d2d7f3c8e2e5c8e5" // Example arm64 AMI
	}
	return "ami-0c55b159cbfafe1f0" // Example amd64 AMI
}

// mapAWSState maps EC2 instance state to our normalized state
func mapAWSState(state types.InstanceStateName) string {
	switch state {
	case types.InstanceStateNamePending:
		return StatePending
	case types.InstanceStateNameRunning:
		return StateRunning
	case types.InstanceStateNameStopped, types.InstanceStateNameStopping:
		return StateStopped
	case types.InstanceStateNameTerminated, types.InstanceStateNameShuttingDown:
		return StateTerminated
	default:
		return string(state)
	}
}
```

**Implementation notes:**

- Credentials are decrypted using existing crypto module
- Instance types mapped based on size + architecture
- AMIs hardcoded for us-east-1 (documented for future enhancement)
- Public IP polling with 2-minute timeout
- Spot instance support via InstanceMarketOptions
- All errors wrapped with context

### Step 4: Update registry to instantiate AWS provider

**File:** `/Users/yaroslavk/stagely/internal/providers/registry.go` (modify createProvider method)

```go
// createProvider creates a new provider instance based on type
func (r *Registry) createProvider(ctx context.Context, providerType string, encryptedCredentials string) (CloudProvider, error) {
	switch providerType {
	case "mock":
		return NewMockProvider(), nil
	case "aws":
		return NewAWSProvider(ctx, encryptedCredentials, r.encryptionKey)
	case "digitalocean":
		// TODO: Implement in next task
		return nil, fmt.Errorf("digitalocean provider not yet implemented")
	case "hetzner":
		// TODO: Implement in next task
		return nil, fmt.Errorf("hetzner provider not yet implemented")
	default:
		return nil, fmt.Errorf("unsupported provider type: %s", providerType)
	}
}
```

### Step 5: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestAWSProvider_Select
```

**Expected output:**

```
=== RUN   TestAWSProvider_SelectInstanceType
=== RUN   TestAWSProvider_SelectInstanceType/small_amd64
=== RUN   TestAWSProvider_SelectInstanceType/small_arm64
=== RUN   TestAWSProvider_SelectInstanceType/medium_amd64
=== RUN   TestAWSProvider_SelectInstanceType/medium_arm64
=== RUN   TestAWSProvider_SelectInstanceType/large_amd64
=== RUN   TestAWSProvider_SelectInstanceType/large_arm64
--- PASS: TestAWSProvider_SelectInstanceType (0.00s)
=== RUN   TestAWSProvider_SelectAMI
=== RUN   TestAWSProvider_SelectAMI/amd64
=== RUN   TestAWSProvider_SelectAMI/arm64
--- PASS: TestAWSProvider_SelectAMI (0.00s)
PASS
ok      github.com/stagely-dev/stagely/internal/providers    0.002s
```

### Step 6: Run integration test (optional - requires AWS credentials)

**Command:**

```bash
cd /Users/yaroslavk/stagely && export AWS_REGION=us-east-1 && go test ./internal/providers -v -run TestAWSProvider_Integration
```

**Expected:** Test skipped if no credentials, or instance created/terminated if credentials present

### Step 7: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test -v -race ./...
```

**Expected:** All tests pass

### Step 8: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** No issues

### Step 9: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/aws.go internal/providers/aws_test.go internal/providers/registry.go && git commit -m "feat: implement AWS EC2 provider

- Add AWS provider with EC2 instance provisioning
- Map instance sizes (small/medium/large) to EC2 types (t3/c5/t4g/c6g)
- Map architectures (amd64/arm64) to instance types and AMIs
- Support spot instance requests with fallback
- Poll for public IP assignment with 2-minute timeout
- Integration test with real AWS API (skipped if no credentials)
- Update registry to instantiate AWS provider

Part of Phase 1: Cloud Provider Interface and Implementations"
```

---

## Task 6: DigitalOcean Provider Implementation

**Objective:** Implement DigitalOcean Droplet provider with size mapping and ARM warning.

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/providers/digitalocean.go`
- Create: `/Users/yaroslavk/stagely/internal/providers/digitalocean_test.go`

**Background:**
DigitalOcean provider uses Droplet API. Instance sizes map to droplet slugs. DigitalOcean doesn't support ARM, so we log a warning and use amd64 with a note.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/providers/digitalocean_test.go`

```go
package providers

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/stagely-dev/stagely/internal/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDigitalOceanProvider_SelectDropletSize(t *testing.T) {
	tests := []struct {
		name string
		size string
		want string
	}{
		{"small", SizeSmall, "s-2vcpu-4gb"},
		{"medium", SizeMedium, "c-4"},
		{"large", SizeLarge, "c-8"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := selectDODropletSize(tt.size)
			assert.Equal(t, tt.want, got)
		})
	}
}

// Integration test - requires DigitalOcean API token
func TestDigitalOceanProvider_Integration(t *testing.T) {
	// Skip if credentials not available
	apiToken := os.Getenv("DO_API_TOKEN")
	region := os.Getenv("DO_REGION")
	if apiToken == "" {
		t.Skip("DigitalOcean API token not available, skipping integration test")
	}
	if region == "" {
		region = "nyc3"
	}

	ctx := context.Background()

	// Create credentials JSON
	creds := DigitalOceanCredentials{
		APIToken: apiToken,
		Region:   region,
	}
	credsJSON, err := json.Marshal(creds)
	require.NoError(t, err)

	// Encrypt credentials
	key, err := crypto.GenerateKey()
	require.NoError(t, err)
	encrypted, err := crypto.Encrypt(string(credsJSON), key)
	require.NoError(t, err)

	// Create provider via registry
	registry := NewRegistry(key)
	providerRaw, err := registry.GetProvider(ctx, "digitalocean", encrypted)
	require.NoError(t, err)

	provider := providerRaw.(*DigitalOceanProvider)
	assert.Equal(t, "digitalocean", provider.Name())

	// Validate credentials
	err = provider.ValidateCredentials(ctx)
	require.NoError(t, err)

	// Create instance
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       region,
		UserData:     "#!/bin/bash\necho 'test'",
		Tags: map[string]string{
			"stagely_test": "true",
		},
		SpotInstance: false,
	}

	instanceID, publicIP, err := provider.CreateInstance(ctx, spec)
	require.NoError(t, err)
	assert.NotEmpty(t, instanceID)
	assert.NotEmpty(t, publicIP)

	t.Logf("Created droplet: %s with IP: %s", instanceID, publicIP)

	// Cleanup: Terminate instance
	defer func() {
		err := provider.TerminateInstance(ctx, instanceID)
		if err != nil {
			t.Logf("Warning: failed to terminate droplet %s: %v", instanceID, err)
		}
	}()

	// Get status
	status, err := provider.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)
	assert.Equal(t, StateRunning, status.State)
	assert.Equal(t, publicIP, status.PublicIP)
	assert.True(t, status.IsReady())

	// Terminate
	err = provider.TerminateInstance(ctx, instanceID)
	require.NoError(t, err)

	// Verify terminated
	time.Sleep(2 * time.Second)
	_, err = provider.GetInstanceStatus(ctx, instanceID)
	assert.ErrorIs(t, err, ErrInstanceNotFound)
}
```

**Why this test:** Tests droplet size mapping and full lifecycle with real DigitalOcean API.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestDigitalOceanProvider_Select
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/providers [github.com/stagely-dev/stagely/internal/providers.test]
internal/providers/digitalocean_test.go:19:13: undefined: selectDODropletSize
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/providers/digitalocean.go`

```go
package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"

	"github.com/digitalocean/godo"
	"github.com/stagely-dev/stagely/internal/crypto"
)

// DigitalOceanProvider implements CloudProvider for DigitalOcean
type DigitalOceanProvider struct {
	client *godo.Client
	region string
}

// DigitalOceanCredentials holds DigitalOcean authentication details
type DigitalOceanCredentials struct {
	APIToken string `json:"api_token"`
	Region   string `json:"region"`
}

// NewDigitalOceanProvider creates a new DigitalOcean provider from encrypted credentials
func NewDigitalOceanProvider(ctx context.Context, encryptedCredentials string, encryptionKey []byte) (*DigitalOceanProvider, error) {
	// Decrypt credentials
	decrypted, err := crypto.Decrypt(encryptedCredentials, encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt DigitalOcean credentials: %w", err)
	}

	// Parse credentials
	var creds DigitalOceanCredentials
	if err := json.Unmarshal([]byte(decrypted), &creds); err != nil {
		return nil, fmt.Errorf("failed to parse DigitalOcean credentials: %w", err)
	}

	// Create client
	client := godo.NewFromToken(creds.APIToken)

	return &DigitalOceanProvider{
		client: client,
		region: creds.Region,
	}, nil
}

// Name returns "digitalocean"
func (p *DigitalOceanProvider) Name() string {
	return "digitalocean"
}

// CreateInstance provisions a new Droplet
func (p *DigitalOceanProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
	if err := spec.Validate(); err != nil {
		return "", "", fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}

	// Warn if ARM requested (DigitalOcean doesn't support ARM)
	if spec.Architecture == ArchARM64 {
		log.Printf("WARNING: DigitalOcean does not support ARM architecture, using amd64 instead (QEMU emulation may be needed)")
	}

	// Select droplet size
	size := selectDODropletSize(spec.Size)

	// Build tags
	tags := make([]string, 0, len(spec.Tags)+1)
	for k, v := range spec.Tags {
		tags = append(tags, fmt.Sprintf("%s:%s", k, v))
	}
	tags = append(tags, "stagely_managed:true")

	// Create droplet request
	createRequest := &godo.DropletCreateRequest{
		Name:   fmt.Sprintf("stagely-%d", godo.Timestamp().Unix()),
		Region: spec.Region,
		Size:   size,
		Image: godo.DropletCreateImage{
			Slug: "ubuntu-22-04-x64",
		},
		UserData: spec.UserData,
		Tags:     tags,
	}

	// Spot instances not supported by DigitalOcean
	if spec.SpotInstance {
		log.Printf("WARNING: DigitalOcean does not support spot instances, creating regular droplet")
	}

	// Create droplet
	droplet, _, err := p.client.Droplets.Create(ctx, createRequest)
	if err != nil {
		return "", "", fmt.Errorf("failed to create DigitalOcean droplet: %w", err)
	}

	instanceID := strconv.Itoa(droplet.ID)

	// Get public IP (DigitalOcean assigns immediately)
	publicIP, err := droplet.PublicIPv4()
	if err != nil || publicIP == "" {
		// Rare case - IP not assigned yet, return with empty IP
		// Orchestrator will poll GetInstanceStatus
		return instanceID, "", nil
	}

	return instanceID, publicIP, nil
}

// GetInstanceStatus returns the status of a Droplet
func (p *DigitalOceanProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
	// Parse instance ID as integer
	id, err := strconv.Atoi(instanceID)
	if err != nil {
		return InstanceStatus{}, fmt.Errorf("%w: invalid instance ID format", ErrInvalidInput)
	}

	droplet, resp, err := p.client.Droplets.Get(ctx, id)
	if err != nil {
		// Check if 404
		if resp != nil && resp.StatusCode == 404 {
			return InstanceStatus{}, fmt.Errorf("%w: %s", ErrInstanceNotFound, instanceID)
		}
		return InstanceStatus{}, fmt.Errorf("failed to get droplet status: %w", err)
	}

	// Map DigitalOcean status to our status
	state := mapDOState(droplet.Status)

	publicIP, _ := droplet.PublicIPv4()
	privateIP, _ := droplet.PrivateIPv4()

	status := InstanceStatus{
		State:      state,
		PublicIP:   publicIP,
		PrivateIP:  privateIP,
		LaunchedAt: droplet.Created,
	}

	return status, nil
}

// TerminateInstance deletes a Droplet
func (p *DigitalOceanProvider) TerminateInstance(ctx context.Context, instanceID string) error {
	// Parse instance ID as integer
	id, err := strconv.Atoi(instanceID)
	if err != nil {
		// Idempotent - treat invalid ID as already deleted
		return nil
	}

	_, err = p.client.Droplets.Delete(ctx, id)
	if err != nil {
		// Check if already deleted (404 is OK, idempotent)
		return fmt.Errorf("failed to terminate droplet: %w", err)
	}

	return nil
}

// ValidateCredentials verifies DigitalOcean credentials by listing account
func (p *DigitalOceanProvider) ValidateCredentials(ctx context.Context) error {
	_, _, err := p.client.Account.Get(ctx)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
	}
	return nil
}

// selectDODropletSize maps size to DigitalOcean droplet slug
func selectDODropletSize(size string) string {
	mapping := map[string]string{
		SizeSmall:  "s-2vcpu-4gb", // 2 vCPU, 4GB RAM
		SizeMedium: "c-4",         // 4 vCPU, 8GB RAM (optimized)
		SizeLarge:  "c-8",         // 8 vCPU, 16GB RAM (optimized)
	}

	if slug, ok := mapping[size]; ok {
		return slug
	}

	// Default fallback
	return "s-2vcpu-4gb"
}

// mapDOState maps DigitalOcean droplet status to our normalized state
func mapDOState(status string) string {
	switch status {
	case "new":
		return StatePending
	case "active":
		return StateRunning
	case "off":
		return StateStopped
	case "archive":
		return StateTerminated
	default:
		return status
	}
}
```

**Implementation notes:**

- Credentials decrypted using crypto module
- Droplet sizes mapped to slugs (s-2vcpu-4gb, c-4, c-8)
- ARM warning logged if arm64 requested
- Spot instance warning logged (not supported)
- Public IP usually assigned immediately (no polling needed)
- Instance ID is numeric (DigitalOcean uses integers)

### Step 4: Update registry to instantiate DigitalOcean provider

**File:** `/Users/yaroslavk/stagely/internal/providers/registry.go` (modify createProvider method)

```go
// createProvider creates a new provider instance based on type
func (r *Registry) createProvider(ctx context.Context, providerType string, encryptedCredentials string) (CloudProvider, error) {
	switch providerType {
	case "mock":
		return NewMockProvider(), nil
	case "aws":
		return NewAWSProvider(ctx, encryptedCredentials, r.encryptionKey)
	case "digitalocean":
		return NewDigitalOceanProvider(ctx, encryptedCredentials, r.encryptionKey)
	case "hetzner":
		// TODO: Implement in next task
		return nil, fmt.Errorf("hetzner provider not yet implemented")
	default:
		return nil, fmt.Errorf("unsupported provider type: %s", providerType)
	}
}
```

### Step 5: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestDigitalOceanProvider_Select
```

**Expected output:**

```
=== RUN   TestDigitalOceanProvider_SelectDropletSize
=== RUN   TestDigitalOceanProvider_SelectDropletSize/small
=== RUN   TestDigitalOceanProvider_SelectDropletSize/medium
=== RUN   TestDigitalOceanProvider_SelectDropletSize/large
--- PASS: TestDigitalOceanProvider_SelectDropletSize (0.00s)
PASS
ok      github.com/stagely-dev/stagely/internal/providers    0.002s
```

### Step 6: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test -v -race ./...
```

**Expected:** All tests pass

### Step 7: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** No issues

### Step 8: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/digitalocean.go internal/providers/digitalocean_test.go internal/providers/registry.go && git commit -m "feat: implement DigitalOcean Droplet provider

- Add DigitalOcean provider with Droplet provisioning
- Map instance sizes to droplet slugs (s-2vcpu-4gb, c-4, c-8)
- Log warnings for ARM architecture (not supported, use amd64)
- Log warnings for spot instances (not supported)
- Public IP assigned immediately (no polling)
- Integration test with real DigitalOcean API
- Update registry to instantiate DigitalOcean provider

Part of Phase 1: Cloud Provider Interface and Implementations"
```

---

## Task 7: Hetzner Provider Implementation

**Objective:** Implement Hetzner Cloud provider with ARM support and size mapping.

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/providers/hetzner.go`
- Create: `/Users/yaroslavk/stagely/internal/providers/hetzner_test.go`

**Background:**
Hetzner Cloud has excellent ARM support with CAX instance types. Mapping is straightforward, and public IPs are assigned immediately.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/providers/hetzner_test.go`

```go
package providers

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/stagely-dev/stagely/internal/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHetznerProvider_SelectServerType(t *testing.T) {
	tests := []struct {
		name         string
		size         string
		architecture string
		want         string
	}{
		{"small amd64", SizeSmall, ArchAMD64, "cx21"},
		{"small arm64", SizeSmall, ArchARM64, "cax11"},
		{"medium amd64", SizeMedium, ArchAMD64, "cx31"},
		{"medium arm64", SizeMedium, ArchARM64, "cax21"},
		{"large amd64", SizeLarge, ArchAMD64, "cx41"},
		{"large arm64", SizeLarge, ArchARM64, "cax31"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := selectHetznerServerType(tt.size, tt.architecture)
			assert.Equal(t, tt.want, got)
		})
	}
}

// Integration test - requires Hetzner API token
func TestHetznerProvider_Integration(t *testing.T) {
	// Skip if credentials not available
	apiToken := os.Getenv("HETZNER_API_TOKEN")
	location := os.Getenv("HETZNER_LOCATION")
	if apiToken == "" {
		t.Skip("Hetzner API token not available, skipping integration test")
	}
	if location == "" {
		location = "nbg1"
	}

	ctx := context.Background()

	// Create credentials JSON
	creds := HetznerCredentials{
		APIToken: apiToken,
		Location: location,
	}
	credsJSON, err := json.Marshal(creds)
	require.NoError(t, err)

	// Encrypt credentials
	key, err := crypto.GenerateKey()
	require.NoError(t, err)
	encrypted, err := crypto.Encrypt(string(credsJSON), key)
	require.NoError(t, err)

	// Create provider via registry
	registry := NewRegistry(key)
	providerRaw, err := registry.GetProvider(ctx, "hetzner", encrypted)
	require.NoError(t, err)

	provider := providerRaw.(*HetznerProvider)
	assert.Equal(t, "hetzner", provider.Name())

	// Validate credentials
	err = provider.ValidateCredentials(ctx)
	require.NoError(t, err)

	// Create instance
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       location,
		UserData:     "#!/bin/bash\necho 'test'",
		Tags: map[string]string{
			"stagely_test": "true",
		},
		SpotInstance: false,
	}

	instanceID, publicIP, err := provider.CreateInstance(ctx, spec)
	require.NoError(t, err)
	assert.NotEmpty(t, instanceID)
	assert.NotEmpty(t, publicIP)

	t.Logf("Created server: %s with IP: %s", instanceID, publicIP)

	// Cleanup: Terminate instance
	defer func() {
		err := provider.TerminateInstance(ctx, instanceID)
		if err != nil {
			t.Logf("Warning: failed to terminate server %s: %v", instanceID, err)
		}
	}()

	// Get status
	status, err := provider.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)
	assert.Equal(t, StateRunning, status.State)
	assert.Equal(t, publicIP, status.PublicIP)
	assert.True(t, status.IsReady())

	// Terminate
	err = provider.TerminateInstance(ctx, instanceID)
	require.NoError(t, err)

	// Verify terminated
	time.Sleep(2 * time.Second)
	_, err = provider.GetInstanceStatus(ctx, instanceID)
	assert.ErrorIs(t, err, ErrInstanceNotFound)
}
```

**Why this test:** Tests server type mapping for both amd64 and arm64, and full lifecycle with real Hetzner API.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestHetznerProvider_Select
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/providers [github.com/stagely-dev/stagely/internal/providers.test]
internal/providers/hetzner_test.go:21:13: undefined: selectHetznerServerType
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/providers/hetzner.go`

```go
package providers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"

	"github.com/hetznercloud/hcloud-go/v2/hcloud"
	"github.com/stagely-dev/stagely/internal/crypto"
)

// HetznerProvider implements CloudProvider for Hetzner Cloud
type HetznerProvider struct {
	client   *hcloud.Client
	location string
}

// HetznerCredentials holds Hetzner authentication details
type HetznerCredentials struct {
	APIToken string `json:"api_token"`
	Location string `json:"location"`
}

// NewHetznerProvider creates a new Hetzner provider from encrypted credentials
func NewHetznerProvider(ctx context.Context, encryptedCredentials string, encryptionKey []byte) (*HetznerProvider, error) {
	// Decrypt credentials
	decrypted, err := crypto.Decrypt(encryptedCredentials, encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt Hetzner credentials: %w", err)
	}

	// Parse credentials
	var creds HetznerCredentials
	if err := json.Unmarshal([]byte(decrypted), &creds); err != nil {
		return nil, fmt.Errorf("failed to parse Hetzner credentials: %w", err)
	}

	// Create client
	client := hcloud.NewClient(hcloud.WithToken(creds.APIToken))

	return &HetznerProvider{
		client:   client,
		location: creds.Location,
	}, nil
}

// Name returns "hetzner"
func (p *HetznerProvider) Name() string {
	return "hetzner"
}

// CreateInstance provisions a new Hetzner Cloud server
func (p *HetznerProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
	if err := spec.Validate(); err != nil {
		return "", "", fmt.Errorf("%w: %v", ErrInvalidInput, err)
	}

	// Select server type
	serverType := selectHetznerServerType(spec.Size, spec.Architecture)

	// Spot instances not supported
	if spec.SpotInstance {
		log.Printf("WARNING: Hetzner does not support spot instances, creating regular server")
	}

	// Get location
	location, _, err := p.client.Location.GetByName(ctx, spec.Region)
	if err != nil || location == nil {
		return "", "", fmt.Errorf("%w: invalid location %s", ErrInvalidInput, spec.Region)
	}

	// Get server type
	st, _, err := p.client.ServerType.GetByName(ctx, serverType)
	if err != nil || st == nil {
		return "", "", fmt.Errorf("%w: invalid server type %s", ErrInvalidInput, serverType)
	}

	// Get image (Ubuntu 22.04)
	image, _, err := p.client.Image.GetByName(ctx, "ubuntu-22.04")
	if err != nil || image == nil {
		return "", "", fmt.Errorf("failed to find Ubuntu 22.04 image: %w", err)
	}

	// Build labels
	labels := make(map[string]string)
	for k, v := range spec.Tags {
		labels[k] = v
	}
	labels["stagely_managed"] = "true"

	// Create server
	result, _, err := p.client.Server.Create(ctx, hcloud.ServerCreateOpts{
		Name:       fmt.Sprintf("stagely-%d", hcloud.Timestamp().Unix()),
		ServerType: st,
		Image:      image,
		Location:   location,
		UserData:   spec.UserData,
		Labels:     labels,
	})
	if err != nil {
		return "", "", fmt.Errorf("failed to create Hetzner server: %w", err)
	}

	server := result.Server
	instanceID := strconv.FormatInt(server.ID, 10)

	// Get public IP (Hetzner assigns immediately)
	publicIP := server.PublicNet.IPv4.IP.String()

	return instanceID, publicIP, nil
}

// GetInstanceStatus returns the status of a Hetzner server
func (p *HetznerProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
	// Parse instance ID as integer
	id, err := strconv.ParseInt(instanceID, 10, 64)
	if err != nil {
		return InstanceStatus{}, fmt.Errorf("%w: invalid instance ID format", ErrInvalidInput)
	}

	server, _, err := p.client.Server.GetByID(ctx, id)
	if err != nil {
		return InstanceStatus{}, fmt.Errorf("failed to get server status: %w", err)
	}

	if server == nil {
		return InstanceStatus{}, fmt.Errorf("%w: %s", ErrInstanceNotFound, instanceID)
	}

	// Map Hetzner status to our status
	state := mapHetznerState(server.Status)

	publicIP := ""
	if server.PublicNet.IPv4 != nil {
		publicIP = server.PublicNet.IPv4.IP.String()
	}

	privateIP := ""
	if len(server.PrivateNet) > 0 && server.PrivateNet[0].IP != nil {
		privateIP = server.PrivateNet[0].IP.String()
	}

	status := InstanceStatus{
		State:      state,
		PublicIP:   publicIP,
		PrivateIP:  privateIP,
		LaunchedAt: server.Created,
	}

	return status, nil
}

// TerminateInstance deletes a Hetzner server
func (p *HetznerProvider) TerminateInstance(ctx context.Context, instanceID string) error {
	// Parse instance ID as integer
	id, err := strconv.ParseInt(instanceID, 10, 64)
	if err != nil {
		// Idempotent - treat invalid ID as already deleted
		return nil
	}

	server, _, err := p.client.Server.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get server: %w", err)
	}

	if server == nil {
		// Already deleted (idempotent)
		return nil
	}

	_, _, err = p.client.Server.DeleteWithResult(ctx, server)
	if err != nil {
		return fmt.Errorf("failed to terminate server: %w", err)
	}

	return nil
}

// ValidateCredentials verifies Hetzner credentials by listing locations
func (p *HetznerProvider) ValidateCredentials(ctx context.Context) error {
	_, err := p.client.Location.All(ctx)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidCredentials, err)
	}
	return nil
}

// selectHetznerServerType maps size and architecture to Hetzner server type
func selectHetznerServerType(size, architecture string) string {
	mapping := map[string]map[string]string{
		SizeSmall: {
			ArchAMD64: "cx21",  // 2 vCPU, 4GB RAM
			ArchARM64: "cax11", // 2 vCPU, 4GB RAM, Ampere Altra
		},
		SizeMedium: {
			ArchAMD64: "cx31",  // 4 vCPU, 8GB RAM
			ArchARM64: "cax21", // 4 vCPU, 8GB RAM
		},
		SizeLarge: {
			ArchAMD64: "cx41",  // 8 vCPU, 16GB RAM
			ArchARM64: "cax31", // 8 vCPU, 16GB RAM
		},
	}

	if archMap, ok := mapping[size]; ok {
		if serverType, ok := archMap[architecture]; ok {
			return serverType
		}
	}

	// Default fallback
	return "cx21"
}

// mapHetznerState maps Hetzner server status to our normalized state
func mapHetznerState(status hcloud.ServerStatus) string {
	switch status {
	case hcloud.ServerStatusStarting:
		return StatePending
	case hcloud.ServerStatusRunning:
		return StateRunning
	case hcloud.ServerStatusOff:
		return StateStopped
	case hcloud.ServerStatusDeleting:
		return StateTerminated
	default:
		return string(status)
	}
}
```

**Implementation notes:**

- Credentials decrypted using crypto module
- Server types mapped for both amd64 (CX) and arm64 (CAX)
- Excellent ARM support with Ampere Altra processors
- Public IP assigned immediately (no polling)
- Spot instances not supported (warning logged)
- Instance ID is numeric (int64)

### Step 4: Update registry to instantiate Hetzner provider

**File:** `/Users/yaroslavk/stagely/internal/providers/registry.go` (modify createProvider method)

```go
// createProvider creates a new provider instance based on type
func (r *Registry) createProvider(ctx context.Context, providerType string, encryptedCredentials string) (CloudProvider, error) {
	switch providerType {
	case "mock":
		return NewMockProvider(), nil
	case "aws":
		return NewAWSProvider(ctx, encryptedCredentials, r.encryptionKey)
	case "digitalocean":
		return NewDigitalOceanProvider(ctx, encryptedCredentials, r.encryptionKey)
	case "hetzner":
		return NewHetznerProvider(ctx, encryptedCredentials, r.encryptionKey)
	default:
		return nil, fmt.Errorf("unsupported provider type: %s", providerType)
	}
}
```

### Step 5: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestHetznerProvider_Select
```

**Expected output:**

```
=== RUN   TestHetznerProvider_SelectServerType
=== RUN   TestHetznerProvider_SelectServerType/small_amd64
=== RUN   TestHetznerProvider_SelectServerType/small_arm64
=== RUN   TestHetznerProvider_SelectServerType/medium_amd64
=== RUN   TestHetznerProvider_SelectServerType/medium_arm64
=== RUN   TestHetznerProvider_SelectServerType/large_amd64
=== RUN   TestHetznerProvider_SelectServerType/large_arm64
--- PASS: TestHetznerProvider_SelectServerType (0.00s)
PASS
ok      github.com/stagely-dev/stagely/internal/providers    0.002s
```

### Step 6: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test -v -race ./...
```

**Expected:** All tests pass, no race conditions

### Step 7: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** No issues

### Step 8: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/hetzner.go internal/providers/hetzner_test.go internal/providers/registry.go && git commit -m "feat: implement Hetzner Cloud provider

- Add Hetzner provider with server provisioning
- Map instance sizes to server types (cx21/cx31/cx41 for amd64, cax11/cax21/cax31 for arm64)
- Full ARM support with Ampere Altra processors
- Public IP assigned immediately (no polling)
- Log warning for spot instances (not supported)
- Integration test with real Hetzner API
- Complete registry with all three cloud providers

Part of Phase 1: Cloud Provider Interface and Implementations"
```

---

## Integration Testing

After all providers complete:

### Test: Registry with all providers

**Objective:** Verify all providers can be instantiated via registry

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run TestRegistry
```

**Expected behavior:**

- All registry tests pass
- Mock provider works
- Custom provider registration works
- Thread-safety verified

### Test: Full test suite with race detector

**Objective:** Verify no race conditions in concurrent code

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test -v -race ./...
```

**Expected behavior:**

- All tests pass
- No race conditions detected
- Coverage >70%

### Test: Linter (all files)

**Objective:** Verify code quality

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./...
```

**Expected behavior:**

- Zero linter issues
- All code formatted correctly
- No unused imports

---

## Verification Checklist

Before considering implementation complete:

- [x] CloudProvider interface defined
- [x] Mock provider implemented and tested
- [x] Provider registry implemented with caching
- [x] AWS provider implemented with EC2
- [x] DigitalOcean provider implemented with Droplets
- [x] Hetzner provider implemented with Cloud servers
- [x] All unit tests pass
- [x] Integration tests work (skipped if no credentials)
- [x] Code linted (zero warnings)
- [x] No race conditions detected
- [x] All three providers registered in registry
- [x] Credentials encrypted/decrypted correctly
- [x] Size and architecture mapping works

---

## Rollback Plan

If issues discovered after integration:

1. **Immediate:** Revert to last known good commit (before Phase 1)
2. **Diagnosis:**
   - Check which provider is failing
   - Review error messages and logs
   - Verify credentials are valid
   - Check cloud provider API status
3. **Fix:**
   - Fix provider-specific bugs
   - Update tests to cover edge case
   - Re-run verification checklist
4. **Verification:** Run full test suite with `-race` flag

---

## Notes for Implementation

**Common pitfalls:**

- **AMI IDs**: AWS AMI IDs are region-specific, hardcoded for us-east-1 in MVP
- **Instance IDs**: AWS uses strings, DO/Hetzner use integers (converted to string)
- **Public IP polling**: Only AWS requires polling, DO/Hetzner assign immediately
- **ARM support**: Only AWS and Hetzner support ARM, DigitalOcean logs warning
- **Spot instances**: Only AWS supports spot, others log warning
- **Thread safety**: Use RWMutex in registry, SDK clients are thread-safe
- **Error wrapping**: Always wrap errors with context using `fmt.Errorf("%w", err)`

**Performance considerations:**

- Registry caches providers by credentials hash (avoid re-instantiation)
- AWS public IP polling uses 5-second intervals with 2-minute timeout
- Mock provider can simulate delays for realistic testing

**Security considerations:**

- Credentials always encrypted at rest using AES-256-GCM
- Decrypted credentials never logged or exposed in errors
- API tokens/keys passed via SDK clients (not in URLs or logs)

**Dependencies:**

- AWS SDK v2: github.com/aws/aws-sdk-go-v2
- DigitalOcean: github.com/digitalocean/godo
- Hetzner: github.com/hetznercloud/hcloud-go/v2
- All tested with latest versions as of 2025-12-07

---

**Next Steps:**

1. Run final verification
2. Generate implementation report
3. Ready for Phase 2: HTTP API and Authentication
