package providers

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRegistry_Register(t *testing.T) {
	registry := NewRegistry()
	provider := NewMockProvider()

	err := registry.Register("mock", provider)
	require.NoError(t, err)

	// Verify provider is registered
	retrieved, err := registry.Get("mock")
	require.NoError(t, err)
	assert.Equal(t, provider, retrieved)
}

func TestRegistry_Register_Duplicate(t *testing.T) {
	registry := NewRegistry()
	provider1 := NewMockProvider()
	provider2 := NewMockProvider()

	err := registry.Register("mock", provider1)
	require.NoError(t, err)

	// Attempting to register duplicate should fail
	err = registry.Register("mock", provider2)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "already registered")
}

func TestRegistry_Get(t *testing.T) {
	registry := NewRegistry()
	provider := NewMockProvider()

	err := registry.Register("mock", provider)
	require.NoError(t, err)

	retrieved, err := registry.Get("mock")
	require.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.Equal(t, "mock", retrieved.Name())
}

func TestRegistry_Get_NotFound(t *testing.T) {
	registry := NewRegistry()

	_, err := registry.Get("nonexistent")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestRegistry_List(t *testing.T) {
	registry := NewRegistry()

	// Empty registry
	providers := registry.List()
	assert.Empty(t, providers)

	// Register multiple providers
	mock1 := NewMockProvider()
	mock2 := NewMockProvider()

	err := registry.Register("mock1", mock1)
	require.NoError(t, err)

	err = registry.Register("mock2", mock2)
	require.NoError(t, err)

	providers = registry.List()
	assert.Len(t, providers, 2)
	assert.Contains(t, providers, "mock1")
	assert.Contains(t, providers, "mock2")
}

func TestRegistry_Unregister(t *testing.T) {
	registry := NewRegistry()
	provider := NewMockProvider()

	err := registry.Register("mock", provider)
	require.NoError(t, err)

	// Unregister
	err = registry.Unregister("mock")
	require.NoError(t, err)

	// Verify it's gone
	_, err = registry.Get("mock")
	assert.Error(t, err)
}

func TestRegistry_Unregister_NotFound(t *testing.T) {
	registry := NewRegistry()

	// Unregistering non-existent provider should not error (idempotent)
	err := registry.Unregister("nonexistent")
	assert.NoError(t, err)
}

func TestRegistry_ConcurrentAccess(t *testing.T) {
	registry := NewRegistry()

	var wg sync.WaitGroup
	numGoroutines := 100

	// Concurrent registration
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			provider := NewMockProvider()
			// Some will succeed, some will fail due to duplicates
			_ = registry.Register("mock", provider)
		}(i)
	}
	wg.Wait()

	// Verify registry still works
	_, err := registry.Get("mock")
	assert.NoError(t, err)

	// Concurrent reads
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = registry.Get("mock")
			_ = registry.List()
		}()
	}
	wg.Wait()
}

func TestRegistry_ConcurrentRegisterUnregister(t *testing.T) {
	registry := NewRegistry()
	var wg sync.WaitGroup

	// Register initial provider
	provider := NewMockProvider()
	err := registry.Register("test", provider)
	require.NoError(t, err)

	numOps := 50

	// Concurrent unregister and register
	for i := 0; i < numOps; i++ {
		wg.Add(2)

		// Unregister
		go func() {
			defer wg.Done()
			_ = registry.Unregister("test")
		}()

		// Register
		go func() {
			defer wg.Done()
			p := NewMockProvider()
			_ = registry.Register("test", p)
		}()
	}
	wg.Wait()

	// Registry should still be functional
	providers := registry.List()
	assert.NotNil(t, providers)
}

func TestRegistry_GlobalRegistry(t *testing.T) {
	// Test that default global registry exists
	assert.NotNil(t, DefaultRegistry)

	// Test registering to global
	provider := NewMockProvider()
	err := DefaultRegistry.Register("test-global", provider)
	require.NoError(t, err)

	// Clean up
	err = DefaultRegistry.Unregister("test-global")
	require.NoError(t, err)
}

func TestRegistry_RegisterNilProvider(t *testing.T) {
	registry := NewRegistry()

	err := registry.Register("nil-test", nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "provider cannot be nil")
}

func TestRegistry_RegisterEmptyName(t *testing.T) {
	registry := NewRegistry()
	provider := NewMockProvider()

	err := registry.Register("", provider)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "name cannot be empty")
}

func TestRegistry_GetAfterMultipleOperations(t *testing.T) {
	registry := NewRegistry()

	// Register
	p1 := NewMockProvider()
	err := registry.Register("provider1", p1)
	require.NoError(t, err)

	// Register another
	p2 := NewMockProvider()
	err = registry.Register("provider2", p2)
	require.NoError(t, err)

	// Unregister first
	err = registry.Unregister("provider1")
	require.NoError(t, err)

	// Verify only second exists
	_, err = registry.Get("provider1")
	assert.Error(t, err)

	retrieved, err := registry.Get("provider2")
	require.NoError(t, err)
	assert.Equal(t, p2, retrieved)

	// List should only have one
	providers := registry.List()
	assert.Len(t, providers, 1)
	assert.Contains(t, providers, "provider2")
}
