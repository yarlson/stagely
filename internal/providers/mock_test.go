package providers

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMockProvider_Name(t *testing.T) {
	provider := NewMockProvider()
	assert.Equal(t, "mock", provider.Name())
}

func TestMockProvider_CreateInstance(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "us-east-1",
		UserData:     "#!/bin/bash\necho hello",
		Tags:         map[string]string{"env": "test"},
		SpotInstance: false,
	}

	instanceID, publicIP, err := provider.CreateInstance(ctx, spec)
	require.NoError(t, err)
	assert.NotEmpty(t, instanceID)
	assert.NotEmpty(t, publicIP)
	assert.Contains(t, instanceID, "mock-")
}

func TestMockProvider_CreateInstance_InvalidSpec(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	spec := InstanceSpec{
		Size:         "invalid",
		Architecture: ArchAMD64,
		Region:       "us-east-1",
	}

	_, _, err := provider.CreateInstance(ctx, spec)
	assert.Error(t, err)
}

func TestMockProvider_GetInstanceStatus(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	// Create instance first
	spec := InstanceSpec{
		Size:         SizeMedium,
		Architecture: ArchARM64,
		Region:       "eu-west-1",
	}
	instanceID, publicIP, err := provider.CreateInstance(ctx, spec)
	require.NoError(t, err)

	// Get status
	status, err := provider.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)
	assert.Equal(t, StateRunning, status.State)
	assert.Equal(t, publicIP, status.PublicIP)
	assert.True(t, status.IsReady())
	assert.False(t, status.LaunchedAt.IsZero())
}

func TestMockProvider_GetInstanceStatus_NotFound(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	_, err := provider.GetInstanceStatus(ctx, "nonexistent")
	assert.ErrorIs(t, err, ErrInstanceNotFound)
}

func TestMockProvider_TerminateInstance(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	// Create instance
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "us-west-2",
	}
	instanceID, _, err := provider.CreateInstance(ctx, spec)
	require.NoError(t, err)

	// Terminate instance
	err = provider.TerminateInstance(ctx, instanceID)
	require.NoError(t, err)

	// Verify it's terminated
	status, err := provider.GetInstanceStatus(ctx, instanceID)
	require.NoError(t, err)
	assert.Equal(t, StateTerminated, status.State)
}

func TestMockProvider_TerminateInstance_Idempotent(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	// Terminate non-existent instance (should not error)
	err := provider.TerminateInstance(ctx, "nonexistent")
	assert.NoError(t, err)
}

func TestMockProvider_ValidateCredentials(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	// Mock provider always validates successfully
	err := provider.ValidateCredentials(ctx)
	assert.NoError(t, err)
}

func TestMockProvider_MultipleInstances(t *testing.T) {
	ctx := context.Background()
	provider := NewMockProvider()

	spec1 := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "us-east-1",
	}
	spec2 := InstanceSpec{
		Size:         SizeLarge,
		Architecture: ArchARM64,
		Region:       "eu-west-1",
	}

	// Create multiple instances
	id1, ip1, err := provider.CreateInstance(ctx, spec1)
	require.NoError(t, err)

	id2, ip2, err := provider.CreateInstance(ctx, spec2)
	require.NoError(t, err)

	// Verify they're different
	assert.NotEqual(t, id1, id2)
	assert.NotEqual(t, ip1, ip2)

	// Verify both exist
	status1, err := provider.GetInstanceStatus(ctx, id1)
	require.NoError(t, err)
	assert.Equal(t, StateRunning, status1.State)

	status2, err := provider.GetInstanceStatus(ctx, id2)
	require.NoError(t, err)
	assert.Equal(t, StateRunning, status2.State)

	// Terminate one
	err = provider.TerminateInstance(ctx, id1)
	require.NoError(t, err)

	// Verify one terminated, one still running
	status1, err = provider.GetInstanceStatus(ctx, id1)
	require.NoError(t, err)
	assert.Equal(t, StateTerminated, status1.State)

	status2, err = provider.GetInstanceStatus(ctx, id2)
	require.NoError(t, err)
	assert.Equal(t, StateRunning, status2.State)
}

func TestMockProvider_ContextCancellation(t *testing.T) {
	provider := NewMockProvider()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "us-east-1",
	}

	_, _, err := provider.CreateInstance(ctx, spec)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "context canceled")
}

func TestMockProvider_DelaySimulation(t *testing.T) {
	provider := NewMockProviderWithDelay(50 * time.Millisecond)

	ctx := context.Background()
	spec := InstanceSpec{
		Size:         SizeSmall,
		Architecture: ArchAMD64,
		Region:       "us-east-1",
	}

	start := time.Now()
	_, _, err := provider.CreateInstance(ctx, spec)
	duration := time.Since(start)

	require.NoError(t, err)
	assert.GreaterOrEqual(t, duration, 50*time.Millisecond)
}
