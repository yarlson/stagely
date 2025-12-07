package providers

import (
	"errors"
	"fmt"
	"sync"
)

// Registry manages CloudProvider instances with thread-safe access
type Registry struct {
	providers map[string]CloudProvider
	mu        sync.RWMutex
}

// DefaultRegistry is the global provider registry instance
var DefaultRegistry = NewRegistry()

// NewRegistry creates a new provider registry
func NewRegistry() *Registry {
	return &Registry{
		providers: make(map[string]CloudProvider),
	}
}

// Register adds a provider to the registry
// Returns an error if the provider name is already registered or if inputs are invalid
func (r *Registry) Register(name string, provider CloudProvider) error {
	if name == "" {
		return errors.New("name cannot be empty")
	}

	if provider == nil {
		return errors.New("provider cannot be nil")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.providers[name]; exists {
		return fmt.Errorf("provider %q is already registered", name)
	}

	r.providers[name] = provider
	return nil
}

// Get retrieves a provider by name
// Returns an error if the provider is not found
func (r *Registry) Get(name string) (CloudProvider, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	provider, exists := r.providers[name]
	if !exists {
		return nil, fmt.Errorf("provider %q not found", name)
	}

	return provider, nil
}

// List returns a slice of all registered provider names
func (r *Registry) List() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.providers))
	for name := range r.providers {
		names = append(names, name)
	}

	return names
}

// Unregister removes a provider from the registry
// Idempotent - does not error if provider doesn't exist
func (r *Registry) Unregister(name string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.providers, name)
	return nil
}
