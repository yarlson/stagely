package providers

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Compile-time interface compliance check
var _ CloudProvider = (*AWSProvider)(nil)

type mockEC2Client struct {
	describeRegionsFunc    func(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error)
	runInstancesFunc       func(ctx context.Context, params *ec2.RunInstancesInput, optFns ...func(*ec2.Options)) (*ec2.RunInstancesOutput, error)
	describeInstancesFunc  func(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error)
	terminateInstancesFunc func(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error)
}

func (m *mockEC2Client) DescribeRegions(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error) {
	if m.describeRegionsFunc != nil {
		return m.describeRegionsFunc(ctx, params, optFns...)
	}
	return &ec2.DescribeRegionsOutput{}, nil
}

func (m *mockEC2Client) RunInstances(ctx context.Context, params *ec2.RunInstancesInput, optFns ...func(*ec2.Options)) (*ec2.RunInstancesOutput, error) {
	if m.runInstancesFunc != nil {
		return m.runInstancesFunc(ctx, params, optFns...)
	}
	return &ec2.RunInstancesOutput{}, nil
}

func (m *mockEC2Client) DescribeInstances(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error) {
	if m.describeInstancesFunc != nil {
		return m.describeInstancesFunc(ctx, params, optFns...)
	}
	return &ec2.DescribeInstancesOutput{}, nil
}

func (m *mockEC2Client) TerminateInstances(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error) {
	if m.terminateInstancesFunc != nil {
		return m.terminateInstancesFunc(ctx, params, optFns...)
	}
	return &ec2.TerminateInstancesOutput{}, nil
}

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

func TestNewAWSProvider(t *testing.T) {
	tests := []struct {
		name        string
		accessKey   string
		secretKey   string
		region      string
		expectError bool
	}{
		{"valid credentials", "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1", false},
		{"empty access key", "", "secret", "us-east-1", true},
		{"empty secret key", "access", "", "us-east-1", true},
		{"empty region", "access", "secret", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider, err := NewAWSProvider(tt.accessKey, tt.secretKey, tt.region)
			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, provider)
			} else {
				require.NoError(t, err)
				assert.NotNil(t, provider)
				assert.Equal(t, "aws", provider.Name())
			}
		})
	}
}

func TestValidateCredentials(t *testing.T) {
	tests := []struct {
		name        string
		mockError   error
		expectError bool
	}{
		{
			name:        "valid credentials",
			mockError:   nil,
			expectError: false,
		},
		{
			name:        "invalid credentials",
			mockError:   errors.New("UnauthorizedOperation"),
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := &AWSProvider{
				client: &mockEC2Client{
					describeRegionsFunc: func(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error) {
						return &ec2.DescribeRegionsOutput{}, tt.mockError
					},
				},
				region: "us-east-1",
			}

			err := provider.ValidateCredentials(context.Background())
			if tt.expectError {
				assert.ErrorIs(t, err, ErrInvalidCredentials)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestGetInstanceStatus(t *testing.T) {
	launchTime := time.Now()

	tests := []struct {
		name           string
		response       *ec2.DescribeInstancesOutput
		responseError  error
		expectError    bool
		expectedErr    error
		expectedState  string
		expectedPubIP  string
		expectedPrivIP string
	}{
		{
			name: "running instance",
			response: &ec2.DescribeInstancesOutput{
				Reservations: []types.Reservation{
					{
						Instances: []types.Instance{
							{
								InstanceId:       aws.String("i-123"),
								State:            &types.InstanceState{Name: types.InstanceStateNameRunning},
								PublicIpAddress:  aws.String("54.123.45.67"),
								PrivateIpAddress: aws.String("10.0.0.1"),
								LaunchTime:       aws.Time(launchTime),
							},
						},
					},
				},
			},
			expectedState:  StateRunning,
			expectedPubIP:  "54.123.45.67",
			expectedPrivIP: "10.0.0.1",
			expectError:    false,
		},
		{
			name: "stopped instance",
			response: &ec2.DescribeInstancesOutput{
				Reservations: []types.Reservation{
					{
						Instances: []types.Instance{
							{
								InstanceId: aws.String("i-456"),
								State:      &types.InstanceState{Name: types.InstanceStateNameStopped},
								LaunchTime: aws.Time(launchTime),
							},
						},
					},
				},
			},
			expectedState: StateStopped,
			expectError:   false,
		},
		{
			name:        "instance not found",
			response:    &ec2.DescribeInstancesOutput{},
			expectError: true,
			expectedErr: ErrInstanceNotFound,
		},
		{
			name:          "describe error",
			responseError: errors.New("api error"),
			expectError:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := &AWSProvider{
				client: &mockEC2Client{
					describeInstancesFunc: func(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error) {
						return tt.response, tt.responseError
					},
				},
				region: "us-east-1",
			}

			status, err := provider.GetInstanceStatus(context.Background(), "i-123")

			if tt.expectError {
				assert.Error(t, err)
				if tt.expectedErr != nil {
					assert.ErrorIs(t, err, tt.expectedErr)
				}
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.expectedState, status.State)
			assert.Equal(t, tt.expectedPubIP, status.PublicIP)
			assert.Equal(t, tt.expectedPrivIP, status.PrivateIP)
			assert.True(t, status.LaunchedAt.Equal(launchTime))
		})
	}
}

func TestMapEC2State(t *testing.T) {
	tests := []struct {
		name     string
		state    types.InstanceStateName
		expected string
	}{
		{"pending", types.InstanceStateNamePending, StatePending},
		{"running", types.InstanceStateNameRunning, StateRunning},
		{"stopped", types.InstanceStateNameStopped, StateStopped},
		{"stopping", types.InstanceStateNameStopping, StateStopped},
		{"terminated", types.InstanceStateNameTerminated, StateTerminated},
		{"shutting down", types.InstanceStateNameShuttingDown, StateTerminated},
		{"unknown", types.InstanceStateName("weird"), StatePending},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, mapEC2State(tt.state))
		})
	}
}

func TestTerminateInstance(t *testing.T) {
	tests := []struct {
		name        string
		instanceID  string
		mockError   error
		expectError bool
	}{
		{
			name:        "successful termination",
			instanceID:  "i-1234567890abcdef0",
			mockError:   nil,
			expectError: false,
		},
		{
			name:       "instance not found (idempotent)",
			instanceID: "i-notfound",
			mockError: &smithy.GenericAPIError{
				Code: "InvalidInstanceID.NotFound",
			},
			expectError: false,
		},
		{
			name:        "other error",
			instanceID:  "i-error",
			mockError:   errors.New("InternalError"),
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := &AWSProvider{
				client: &mockEC2Client{
					terminateInstancesFunc: func(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error) {
						assert.Equal(t, []string{tt.instanceID}, params.InstanceIds)
						return &ec2.TerminateInstancesOutput{}, tt.mockError
					},
				},
				region: "us-east-1",
			}

			err := provider.TerminateInstance(context.Background(), tt.instanceID)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestCreateInstance(t *testing.T) {
	launchTime := time.Now()

	tests := []struct {
		name               string
		spec               InstanceSpec
		expectRunInstances bool
		expectDescribe     bool
		expectError        bool
	}{
		{
			name: "create small amd64 instance",
			spec: InstanceSpec{
				Size:         SizeSmall,
				Architecture: ArchAMD64,
				Region:       "us-east-1",
				UserData:     "#!/bin/bash\necho hello",
				Tags:         map[string]string{"env": "test"},
				SpotInstance: false,
			},
			expectRunInstances: true,
			expectDescribe:     true,
			expectError:        false,
		},
		{
			name: "create spot instance",
			spec: InstanceSpec{
				Size:         SizeMedium,
				Architecture: ArchARM64,
				Region:       "us-east-1",
				SpotInstance: true,
			},
			expectRunInstances: true,
			expectDescribe:     true,
			expectError:        false,
		},
		{
			name: "invalid spec",
			spec: InstanceSpec{
				Size:         "",
				Architecture: ArchAMD64,
				Region:       "us-east-1",
			},
			expectRunInstances: false,
			expectDescribe:     false,
			expectError:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runInstancesCalled := false
			describeCalled := false

			provider := &AWSProvider{
				client: &mockEC2Client{
					runInstancesFunc: func(ctx context.Context, params *ec2.RunInstancesInput, optFns ...func(*ec2.Options)) (*ec2.RunInstancesOutput, error) {
						runInstancesCalled = true

						expectedType, _ := getInstanceType(tt.spec.Size, tt.spec.Architecture)
						expectedAMI, _ := getAMI(tt.spec.Architecture)

						assert.Equal(t, expectedType, string(params.InstanceType))
						assert.Equal(t, expectedAMI, aws.ToString(params.ImageId))

						if tt.spec.SpotInstance {
							require.NotNil(t, params.InstanceMarketOptions)
							assert.Equal(t, types.MarketTypeSpot, params.InstanceMarketOptions.MarketType)
						}

						if len(tt.spec.Tags) > 0 {
							assert.NotEmpty(t, params.TagSpecifications)
							require.NotEmpty(t, params.TagSpecifications[0].Tags)
						}

						if tt.spec.UserData != "" {
							require.NotNil(t, params.UserData)
							decoded, decodeErr := base64.StdEncoding.DecodeString(aws.ToString(params.UserData))
							require.NoError(t, decodeErr)
							assert.Equal(t, tt.spec.UserData, string(decoded))
						}

						return &ec2.RunInstancesOutput{
							Instances: []types.Instance{
								{
									InstanceId: aws.String("i-test123"),
									State:      &types.InstanceState{Name: types.InstanceStateNamePending},
									LaunchTime: aws.Time(launchTime),
								},
							},
						}, nil
					},
					describeInstancesFunc: func(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error) {
						describeCalled = true
						return &ec2.DescribeInstancesOutput{
							Reservations: []types.Reservation{
								{
									Instances: []types.Instance{
										{
											InstanceId:       aws.String("i-test123"),
											State:            &types.InstanceState{Name: types.InstanceStateNameRunning},
											PublicIpAddress:  aws.String("54.123.45.67"),
											PrivateIpAddress: aws.String("10.0.1.5"),
											LaunchTime:       aws.Time(launchTime),
										},
									},
								},
							},
						}, nil
					},
				},
				region: "us-east-1",
			}

			instanceID, publicIP, err := provider.CreateInstance(context.Background(), tt.spec)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, "i-test123", instanceID)
				assert.Equal(t, "54.123.45.67", publicIP)
			}

			assert.Equal(t, tt.expectRunInstances, runInstancesCalled)
			if tt.expectDescribe {
				assert.True(t, describeCalled)
			}
		})
	}
}
