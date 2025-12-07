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
	CreateInstance(ctx context.Context, spec InstanceSpec) (instanceID string, publicIP string, err error)

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
