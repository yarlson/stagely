package providers

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"time"
)

// MockProvider is an in-memory mock implementation of CloudProvider for testing
type MockProvider struct {
	instances map[string]*mockInstance
	mu        sync.RWMutex
	delay     time.Duration
}

type mockInstance struct {
	ID           string
	PublicIP     string
	PrivateIP    string
	State        string
	LaunchedAt   time.Time
	Size         string
	Architecture string
	Region       string
}

// NewMockProvider creates a new mock provider with no simulated delay
func NewMockProvider() *MockProvider {
	return &MockProvider{
		instances: make(map[string]*mockInstance),
		delay:     0,
	}
}

// NewMockProviderWithDelay creates a new mock provider with simulated provisioning delay
func NewMockProviderWithDelay(delay time.Duration) *MockProvider {
	return &MockProvider{
		instances: make(map[string]*mockInstance),
		delay:     delay,
	}
}

// Name returns the provider identifier
func (m *MockProvider) Name() string {
	return "mock"
}

// CreateInstance provisions a new mock VM with the given specification
func (m *MockProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
	// Check context cancellation
	if ctx.Err() != nil {
		return "", "", ctx.Err()
	}

	// Validate spec
	if err := spec.Validate(); err != nil {
		return "", "", err
	}

	// Simulate provisioning delay
	if m.delay > 0 {
		select {
		case <-time.After(m.delay):
		case <-ctx.Done():
			return "", "", ctx.Err()
		}
	}

	// Generate mock instance
	instanceID := fmt.Sprintf("mock-%d", time.Now().UnixNano())
	publicIP := fmt.Sprintf("192.0.2.%d", rand.Intn(255))
	privateIP := fmt.Sprintf("10.0.0.%d", rand.Intn(255))

	instance := &mockInstance{
		ID:           instanceID,
		PublicIP:     publicIP,
		PrivateIP:    privateIP,
		State:        StateRunning,
		LaunchedAt:   time.Now(),
		Size:         spec.Size,
		Architecture: spec.Architecture,
		Region:       spec.Region,
	}

	m.mu.Lock()
	m.instances[instanceID] = instance
	m.mu.Unlock()

	return instanceID, publicIP, nil
}

// GetInstanceStatus returns the current status of a mock instance
func (m *MockProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
	if ctx.Err() != nil {
		return InstanceStatus{}, ctx.Err()
	}

	m.mu.RLock()
	instance, exists := m.instances[instanceID]
	m.mu.RUnlock()

	if !exists {
		return InstanceStatus{}, ErrInstanceNotFound
	}

	return InstanceStatus{
		State:      instance.State,
		PublicIP:   instance.PublicIP,
		PrivateIP:  instance.PrivateIP,
		LaunchedAt: instance.LaunchedAt,
	}, nil
}

// TerminateInstance deletes a mock instance (idempotent)
func (m *MockProvider) TerminateInstance(ctx context.Context, instanceID string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	instance, exists := m.instances[instanceID]
	if !exists {
		// Idempotent - no error if already terminated
		return nil
	}

	// Mark as terminated instead of deleting (allows status checks)
	instance.State = StateTerminated
	instance.PublicIP = ""
	instance.PrivateIP = ""

	return nil
}

// ValidateCredentials verifies that stored credentials are valid
// Mock provider always returns success
func (m *MockProvider) ValidateCredentials(ctx context.Context) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return nil
}
