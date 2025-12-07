package providers

import (
	"testing"

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
