package nanoid_test

import (
	"testing"

	"github.com/stagely-dev/stagely/pkg/nanoid"
	"github.com/stretchr/testify/assert"
)

func TestGenerate(t *testing.T) {
	// When
	id := nanoid.Generate()

	// Then
	assert.Len(t, id, 12, "ID should be 12 characters long")
	assert.Regexp(t, "^[a-z0-9]+$", id, "ID should only contain lowercase alphanumeric characters")
}

func TestGenerate_Uniqueness(t *testing.T) {
	// Given
	iterations := 1000
	ids := make(map[string]bool, iterations)

	// When
	for i := 0; i < iterations; i++ {
		id := nanoid.Generate()
		ids[id] = true
	}

	// Then
	assert.Len(t, ids, iterations, "All generated IDs should be unique")
}

func TestGenerateWithLength(t *testing.T) {
	// Given
	tests := []struct {
		name   string
		length int
	}{
		{"length 6", 6},
		{"length 12", 12},
		{"length 20", 20},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// When
			id := nanoid.GenerateWithLength(tt.length)

			// Then
			assert.Len(t, id, tt.length)
			assert.Regexp(t, "^[a-z0-9]+$", id)
		})
	}
}

func TestGenerateWithLength_Zero(t *testing.T) {
	// When
	id := nanoid.GenerateWithLength(0)

	// Then
	assert.Empty(t, id, "Length 0 should return empty string")
}
