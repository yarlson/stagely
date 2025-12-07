package providers

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetInstanceType(t *testing.T) {
	tests := []struct {
		name        string
		size        string
		arch        string
		expected    string
		expectError bool
	}{
		{"small amd64", SizeSmall, ArchAMD64, "t3.small", false},
		{"small arm64", SizeSmall, ArchARM64, "t4g.small", false},
		{"medium amd64", SizeMedium, ArchAMD64, "c5.xlarge", false},
		{"medium arm64", SizeMedium, ArchARM64, "c6g.xlarge", false},
		{"large amd64", SizeLarge, ArchAMD64, "c5.2xlarge", false},
		{"large arm64", SizeLarge, ArchARM64, "c6g.2xlarge", false},
		{"invalid size", "invalid", ArchAMD64, "", true},
		{"invalid arch", SizeSmall, "invalid", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := getInstanceType(tt.size, tt.arch)
			if tt.expectError {
				assert.Error(t, err)
				assert.Empty(t, result)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestGetAMI(t *testing.T) {
	tests := []struct {
		name        string
		arch        string
		expected    string
		expectError bool
	}{
		{"amd64", ArchAMD64, "ami-0c7217cdde317cfec", false},
		{"arm64", ArchARM64, "ami-0c7a8e3f05e4e5f0c", false},
		{"invalid", "invalid", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := getAMI(tt.arch)
			if tt.expectError {
				assert.Error(t, err)
				assert.Empty(t, result)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}
