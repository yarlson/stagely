# AWS Provider Implementation Plan

> **Status:** Ready for implementation
> **Design:** docs/designs/2025-12-07-phase-1b-aws-provider-design.md
> **Phase:** 1B - AWS Provider Implementation

**Goal:** Implement CloudProvider interface for AWS using aws-sdk-go-v2 with instance type mapping, AMI selection, spot instance support, and IP polling.

**Architecture:** AWS provider struct with EC2 client, static instance type and AMI mapping, polling-based public IP waiting, comprehensive error handling following CloudProvider interface.

**Tech Stack:**

- aws-sdk-go-v2/service/ec2 (EC2 API client)
- aws-sdk-go-v2/config (AWS configuration)
- aws-sdk-go-v2/credentials (credential management)
- Go testing package + testify for assertions

**Prerequisites:**

- Phase 1A completed (CloudProvider interface exists)
- Go 1.22+ installed
- golangci-lint configured

---

## Task 1: Add AWS SDK Dependencies

**Objective:** Add AWS SDK v2 dependencies to go.mod

**Files:**

- Modify: `go.mod`

**Background:**
We need AWS SDK v2 packages for EC2 operations. The SDK is modular, so we only import what we need: ec2 service, config loader, and credentials provider.

### Step 1: Add AWS SDK dependencies

**Command:**

```bash
cd /Users/yaroslavk/stagely && go get github.com/aws/aws-sdk-go-v2/config@latest && go get github.com/aws/aws-sdk-go-v2/service/ec2@latest && go get github.com/aws/aws-sdk-go-v2/credentials@latest
```

**Expected output:**

```
go: added github.com/aws/aws-sdk-go-v2/config v1.x.x
go: added github.com/aws/aws-sdk-go-v2/service/ec2 v1.x.x
go: added github.com/aws/aws-sdk-go-v2/credentials v1.x.x
```

### Step 2: Verify dependencies added

**Command:**

```bash
cd /Users/yaroslavk/stagely && go mod tidy
```

**Expected:** No errors, go.mod and go.sum updated

### Step 3: Verify project builds

**Command:**

```bash
cd /Users/yaroslavk/stagely && go build ./...
```

**Expected output:**

```
(no output means success)
```

### Step 4: Commit dependency changes

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add go.mod go.sum && git commit -m "feat: add AWS SDK v2 dependencies for EC2 provider

- Add aws-sdk-go-v2/config for AWS configuration
- Add aws-sdk-go-v2/service/ec2 for EC2 API operations
- Add aws-sdk-go-v2/credentials for credential management

Part of Phase 1B AWS provider implementation."
```

---

## Task 2: Implement Instance Type and AMI Mapping

**Objective:** Create helper functions for mapping size+arch to EC2 instance types and arch to AMI IDs

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/providers/aws.go`
- Create: `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

**Background:**
Before implementing the full provider, we need mapping logic to translate generic CloudProvider sizes (small/medium/large) and architectures (amd64/arm64) to AWS-specific instance types and AMI IDs. This follows the design's static mapping approach.

### Step 1: Write failing tests for instance type mapping

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

```go
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
```

**Why this test:** Verifies instance type and AMI mapping logic works for all valid combinations and properly rejects invalid inputs.

### Step 2: Run tests to verify they fail

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestGetInstanceType|TestGetAMI"
```

**Expected output:**

```
--- FAIL: TestGetInstanceType (0.00s)
    undefined: getInstanceType
--- FAIL: TestGetAMI (0.00s)
    undefined: getAMI
FAIL
```

**Why verify failure:** Ensures tests are actually testing the functions (not false positives).

### Step 3: Implement instance type and AMI mapping

**File:** `/Users/yaroslavk/stagely/internal/providers/aws.go`

```go
package providers

import (
	"fmt"
)

// Instance type mapping: size + architecture -> EC2 instance type
var instanceTypeMap = map[string]map[string]string{
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

// AMI mapping: architecture -> Ubuntu 22.04 LTS AMI ID (us-east-1)
var amiMap = map[string]string{
	ArchAMD64: "ami-0c7217cdde317cfec", // Ubuntu 22.04 LTS AMD64
	ArchARM64: "ami-0c7a8e3f05e4e5f0c", // Ubuntu 22.04 LTS ARM64
}

// getInstanceType returns the EC2 instance type for the given size and architecture
func getInstanceType(size, arch string) (string, error) {
	archMap, ok := instanceTypeMap[size]
	if !ok {
		return "", fmt.Errorf("unsupported size: %s", size)
	}

	instanceType, ok := archMap[arch]
	if !ok {
		return "", fmt.Errorf("unsupported architecture for size %s: %s", size, arch)
	}

	return instanceType, nil
}

// getAMI returns the Ubuntu 22.04 LTS AMI ID for the given architecture
func getAMI(arch string) (string, error) {
	ami, ok := amiMap[arch]
	if !ok {
		return "", fmt.Errorf("unsupported architecture: %s", arch)
	}
	return ami, nil
}
```

**Implementation notes:**

- Using static maps for predictable, testable behavior
- Clear error messages for debugging
- Package-private functions (lowercase) as they're internal helpers

### Step 4: Run tests to verify they pass

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestGetInstanceType|TestGetAMI"
```

**Expected output:**

```
=== RUN   TestGetInstanceType
=== RUN   TestGetInstanceType/small_amd64
=== RUN   TestGetInstanceType/small_arm64
=== RUN   TestGetInstanceType/medium_amd64
=== RUN   TestGetInstanceType/medium_arm64
=== RUN   TestGetInstanceType/large_amd64
=== RUN   TestGetInstanceType/large_arm64
=== RUN   TestGetInstanceType/invalid_size
=== RUN   TestGetInstanceType/invalid_arch
--- PASS: TestGetInstanceType (0.00s)
=== RUN   TestGetAMI
=== RUN   TestGetAMI/amd64
=== RUN   TestGetAMI/arm64
=== RUN   TestGetAMI/invalid
--- PASS: TestGetAMI (0.00s)
PASS
ok      github.com/stagely-dev/stagely/internal/providers
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./... -v
```

**Expected:** All existing tests still pass, no regressions

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected output:**

```
(no output means zero issues)
```

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/aws.go internal/providers/aws_test.go && git commit -m "feat: add AWS instance type and AMI mapping

- Implement static mapping for size+arch to EC2 instance types
- Map small/medium/large to t3/c5 (AMD64) and t4g/c6g (ARM64)
- Implement AMI selection for Ubuntu 22.04 LTS (us-east-1)
- Add comprehensive tests for all valid and invalid combinations

Part of Phase 1B AWS provider implementation."
```

---

## Task 3: Implement AWSProvider Struct and Constructor

**Objective:** Create AWSProvider struct with EC2 client and implement Name() method

**Files:**

- Modify: `/Users/yaroslavk/stagely/internal/providers/aws.go`
- Modify: `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

**Background:**
The AWSProvider struct holds the EC2 client and configuration. We need a constructor that sets up AWS SDK configuration and creates the EC2 client.

### Step 1: Write failing test for AWSProvider constructor

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

Add to existing file:

```go
import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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
				assert.NoError(t, err)
				assert.NotNil(t, provider)
				assert.Equal(t, "aws", provider.Name())
			}
		})
	}
}
```

**Why this test:** Verifies constructor properly validates inputs and creates provider with correct name.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestNewAWSProvider"
```

**Expected output:**

```
--- FAIL: TestNewAWSProvider (0.00s)
    undefined: NewAWSProvider
FAIL
```

### Step 3: Implement AWSProvider struct and constructor

**File:** `/Users/yaroslavk/stagely/internal/providers/aws.go`

Add to existing file:

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
)

// AWSProvider implements CloudProvider for AWS EC2
type AWSProvider struct {
	client *ec2.Client
	region string
}

// NewAWSProvider creates a new AWS provider with the given credentials
func NewAWSProvider(accessKey, secretKey, region string) (*AWSProvider, error) {
	// Validate inputs
	if accessKey == "" {
		return nil, fmt.Errorf("access key is required")
	}
	if secretKey == "" {
		return nil, fmt.Errorf("secret key is required")
	}
	if region == "" {
		return nil, fmt.Errorf("region is required")
	}

	// Load AWS config with static credentials
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKey,
			secretKey,
			"", // session token (not used for IAM users)
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	return &AWSProvider{
		client: ec2.NewFromConfig(cfg),
		region: region,
	}, nil
}

// Name returns the provider identifier
func (a *AWSProvider) Name() string {
	return "aws"
}
```

**Implementation notes:**

- Static credentials for simplicity (can extend to IAM roles later)
- Validates all required fields before creating client
- Uses context.Background() for config loading (one-time operation)
- Wraps errors with context for debugging

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestNewAWSProvider"
```

**Expected output:**

```
=== RUN   TestNewAWSProvider
=== RUN   TestNewAWSProvider/valid_credentials
=== RUN   TestNewAWSProvider/empty_access_key
=== RUN   TestNewAWSProvider/empty_secret_key
=== RUN   TestNewAWSProvider/empty_region
--- PASS: TestNewAWSProvider (0.00s)
PASS
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./... -v
```

**Expected:** All tests pass

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** Zero issues

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/aws.go internal/providers/aws_test.go && git commit -m "feat: add AWSProvider struct and constructor

- Implement AWSProvider struct with EC2 client
- Add NewAWSProvider constructor with credential validation
- Implement Name() method returning 'aws'
- Add tests for constructor validation

Part of Phase 1B AWS provider implementation."
```

---

## Task 4: Implement ValidateCredentials Method

**Objective:** Implement ValidateCredentials to verify AWS credentials are valid

**Files:**

- Modify: `/Users/yaroslavk/stagely/internal/providers/aws.go`
- Modify: `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

**Background:**
ValidateCredentials makes a lightweight API call to verify credentials work. We use DescribeRegions as it's fast and available to all AWS accounts.

### Step 1: Write failing test for ValidateCredentials

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

Add to existing file:

```go
import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Mock EC2 client for testing
type mockEC2Client struct {
	describeRegionsFunc func(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error)
}

func (m *mockEC2Client) DescribeRegions(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error) {
	if m.describeRegionsFunc != nil {
		return m.describeRegionsFunc(ctx, params, optFns...)
	}
	return &ec2.DescribeRegionsOutput{}, nil
}

func TestValidateCredentials(t *testing.T) {
	tests := []struct {
		name          string
		mockResponse  *ec2.DescribeRegionsOutput
		mockError     error
		expectError   bool
		expectedError error
	}{
		{
			name:         "valid credentials",
			mockResponse: &ec2.DescribeRegionsOutput{},
			mockError:    nil,
			expectError:  false,
		},
		{
			name:          "invalid credentials",
			mockResponse:  nil,
			mockError:     errors.New("UnauthorizedOperation"),
			expectError:   true,
			expectedError: ErrInvalidCredentials,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create provider with mock client
			provider := &AWSProvider{
				client: &mockEC2Client{
					describeRegionsFunc: func(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error) {
						return tt.mockResponse, tt.mockError
					},
				},
				region: "us-east-1",
			}

			err := provider.ValidateCredentials(context.Background())

			if tt.expectError {
				assert.Error(t, err)
				if tt.expectedError != nil {
					assert.ErrorIs(t, err, tt.expectedError)
				}
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
```

**Why this test:** Verifies credential validation works with mocked EC2 client, testing both success and failure cases.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestValidateCredentials"
```

**Expected output:**

```
--- FAIL: TestValidateCredentials (0.00s)
    provider.ValidateCredentials undefined
FAIL
```

### Step 3: Update AWSProvider to use interface for testability

**File:** `/Users/yaroslavk/stagely/internal/providers/aws.go`

Modify existing code:

```go
import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
)

// EC2API defines the EC2 operations we need (for mocking in tests)
type EC2API interface {
	DescribeRegions(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error)
	RunInstances(ctx context.Context, params *ec2.RunInstancesInput, optFns ...func(*ec2.Options)) (*ec2.RunInstancesOutput, error)
	DescribeInstances(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error)
	TerminateInstances(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error)
}

// AWSProvider implements CloudProvider for AWS EC2
type AWSProvider struct {
	client EC2API
	region string
}

// NewAWSProvider creates a new AWS provider with the given credentials
func NewAWSProvider(accessKey, secretKey, region string) (*AWSProvider, error) {
	// Validate inputs
	if accessKey == "" {
		return nil, fmt.Errorf("access key is required")
	}
	if secretKey == "" {
		return nil, fmt.Errorf("secret key is required")
	}
	if region == "" {
		return nil, fmt.Errorf("region is required")
	}

	// Load AWS config with static credentials
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKey,
			secretKey,
			"", // session token (not used for IAM users)
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	return &AWSProvider{
		client: ec2.NewFromConfig(cfg),
		region: region,
	}, nil
}

// Name returns the provider identifier
func (a *AWSProvider) Name() string {
	return "aws"
}

// ValidateCredentials verifies that the AWS credentials are valid
func (a *AWSProvider) ValidateCredentials(ctx context.Context) error {
	_, err := a.client.DescribeRegions(ctx, &ec2.DescribeRegionsInput{})
	if err != nil {
		return ErrInvalidCredentials
	}
	return nil
}
```

**Implementation notes:**

- Added EC2API interface for dependency injection (testability)
- Changed client field to use interface instead of concrete type
- ValidateCredentials makes minimal API call
- Returns ErrInvalidCredentials on any error (simplifies error handling)

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestValidateCredentials"
```

**Expected output:**

```
=== RUN   TestValidateCredentials
=== RUN   TestValidateCredentials/valid_credentials
=== RUN   TestValidateCredentials/invalid_credentials
--- PASS: TestValidateCredentials (0.00s)
PASS
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./... -v
```

**Expected:** All tests pass

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** Zero issues

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/aws.go internal/providers/aws_test.go && git commit -m "feat: implement ValidateCredentials for AWS provider

- Add EC2API interface for testability
- Implement ValidateCredentials using DescribeRegions call
- Return ErrInvalidCredentials on validation failure
- Add tests with mocked EC2 client

Part of Phase 1B AWS provider implementation."
```

---

## Task 5: Implement GetInstanceStatus Method

**Objective:** Implement GetInstanceStatus to retrieve instance state and IPs

**Files:**

- Modify: `/Users/yaroslavk/stagely/internal/providers/aws.go`
- Modify: `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

**Background:**
GetInstanceStatus calls DescribeInstances and maps EC2 instance state to CloudProvider state constants.

### Step 1: Write failing test for GetInstanceStatus

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

Add to existing file:

```go
import (
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
)

// Update mock to include DescribeInstances
type mockEC2Client struct {
	describeRegionsFunc   func(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error)
	describeInstancesFunc func(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error)
}

func (m *mockEC2Client) DescribeInstances(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error) {
	if m.describeInstancesFunc != nil {
		return m.describeInstancesFunc(ctx, params, optFns...)
	}
	return &ec2.DescribeInstancesOutput{}, nil
}

func TestGetInstanceStatus(t *testing.T) {
	launchTime := time.Now()

	tests := []struct {
		name           string
		instanceID     string
		mockResponse   *ec2.DescribeInstancesOutput
		mockError      error
		expectedStatus InstanceStatus
		expectError    bool
	}{
		{
			name:       "running instance with public IP",
			instanceID: "i-1234567890abcdef0",
			mockResponse: &ec2.DescribeInstancesOutput{
				Reservations: []types.Reservation{
					{
						Instances: []types.Instance{
							{
								InstanceId:       aws.String("i-1234567890abcdef0"),
								State:            &types.InstanceState{Name: types.InstanceStateNameRunning},
								PublicIpAddress:  aws.String("54.123.45.67"),
								PrivateIpAddress: aws.String("10.0.1.5"),
								LaunchTime:       &launchTime,
							},
						},
					},
				},
			},
			expectedStatus: InstanceStatus{
				State:      StateRunning,
				PublicIP:   "54.123.45.67",
				PrivateIP:  "10.0.1.5",
				LaunchedAt: launchTime,
			},
			expectError: false,
		},
		{
			name:       "pending instance without public IP",
			instanceID: "i-1234567890abcdef1",
			mockResponse: &ec2.DescribeInstancesOutput{
				Reservations: []types.Reservation{
					{
						Instances: []types.Instance{
							{
								InstanceId:       aws.String("i-1234567890abcdef1"),
								State:            &types.InstanceState{Name: types.InstanceStateNamePending},
								PrivateIpAddress: aws.String("10.0.1.6"),
								LaunchTime:       &launchTime,
							},
						},
					},
				},
			},
			expectedStatus: InstanceStatus{
				State:      StatePending,
				PublicIP:   "",
				PrivateIP:  "10.0.1.6",
				LaunchedAt: launchTime,
			},
			expectError: false,
		},
		{
			name:       "instance not found",
			instanceID: "i-notfound",
			mockResponse: &ec2.DescribeInstancesOutput{
				Reservations: []types.Reservation{},
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			provider := &AWSProvider{
				client: &mockEC2Client{
					describeInstancesFunc: func(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error) {
						assert.Equal(t, []string{tt.instanceID}, params.InstanceIds)
						return tt.mockResponse, tt.mockError
					},
				},
				region: "us-east-1",
			}

			status, err := provider.GetInstanceStatus(context.Background(), tt.instanceID)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.expectedStatus.State, status.State)
				assert.Equal(t, tt.expectedStatus.PublicIP, status.PublicIP)
				assert.Equal(t, tt.expectedStatus.PrivateIP, status.PrivateIP)
				assert.True(t, tt.expectedStatus.LaunchedAt.Equal(status.LaunchedAt))
			}
		})
	}
}

func TestMapEC2State(t *testing.T) {
	tests := []struct {
		ec2State types.InstanceStateName
		expected string
	}{
		{types.InstanceStateNamePending, StatePending},
		{types.InstanceStateNameRunning, StateRunning},
		{types.InstanceStateNameStopped, StateStopped},
		{types.InstanceStateNameStopping, StateStopped},
		{types.InstanceStateNameTerminated, StateTerminated},
		{types.InstanceStateNameShuttingDown, StateTerminated},
	}

	for _, tt := range tests {
		t.Run(string(tt.ec2State), func(t *testing.T) {
			result := mapEC2State(tt.ec2State)
			assert.Equal(t, tt.expected, result)
		})
	}
}
```

**Why this test:** Verifies status retrieval correctly maps EC2 states and handles missing instances.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestGetInstanceStatus|TestMapEC2State"
```

**Expected output:**

```
--- FAIL: TestGetInstanceStatus (0.00s)
    provider.GetInstanceStatus undefined
--- FAIL: TestMapEC2State (0.00s)
    undefined: mapEC2State
FAIL
```

### Step 3: Implement GetInstanceStatus and state mapping

**File:** `/Users/yaroslavk/stagely/internal/providers/aws.go`

Add to existing file:

```go
import (
	"time"

	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
)

// GetInstanceStatus returns the current status of an EC2 instance
func (a *AWSProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
	input := &ec2.DescribeInstancesInput{
		InstanceIds: []string{instanceID},
	}

	result, err := a.client.DescribeInstances(ctx, input)
	if err != nil {
		return InstanceStatus{}, fmt.Errorf("describe instances: %w", err)
	}

	// Check if instance exists
	if len(result.Reservations) == 0 || len(result.Reservations[0].Instances) == 0 {
		return InstanceStatus{}, ErrInstanceNotFound
	}

	instance := result.Reservations[0].Instances[0]

	// Map EC2 state to CloudProvider state
	state := mapEC2State(instance.State.Name)

	return InstanceStatus{
		State:      state,
		PublicIP:   aws.ToString(instance.PublicIpAddress),
		PrivateIP:  aws.ToString(instance.PrivateIpAddress),
		LaunchedAt: aws.ToTime(instance.LaunchTime),
	}, nil
}

// mapEC2State maps EC2 instance state to CloudProvider state constants
func mapEC2State(ec2State types.InstanceStateName) string {
	switch ec2State {
	case types.InstanceStateNamePending:
		return StatePending
	case types.InstanceStateNameRunning:
		return StateRunning
	case types.InstanceStateNameStopped, types.InstanceStateNameStopping:
		return StateStopped
	case types.InstanceStateNameTerminated, types.InstanceStateNameShuttingDown:
		return StateTerminated
	default:
		return StatePending
	}
}
```

**Implementation notes:**

- Uses DescribeInstances with instance ID filter
- Returns ErrInstanceNotFound if no reservations
- Maps all EC2 states to CloudProvider states
- Uses aws.ToString and aws.ToTime for safe pointer dereferencing

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestGetInstanceStatus|TestMapEC2State"
```

**Expected output:**

```
=== RUN   TestGetInstanceStatus
--- PASS: TestGetInstanceStatus (0.00s)
=== RUN   TestMapEC2State
--- PASS: TestMapEC2State (0.00s)
PASS
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./... -v
```

**Expected:** All tests pass

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** Zero issues

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/aws.go internal/providers/aws_test.go && git commit -m "feat: implement GetInstanceStatus for AWS provider

- Implement GetInstanceStatus using DescribeInstances
- Add EC2 state mapping to CloudProvider states
- Handle instance not found case
- Add comprehensive tests for all EC2 states

Part of Phase 1B AWS provider implementation."
```

---

## Task 6: Implement TerminateInstance Method

**Objective:** Implement TerminateInstance to delete EC2 instances (idempotent)

**Files:**

- Modify: `/Users/yaroslavk/stagely/internal/providers/aws.go`
- Modify: `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

**Background:**
TerminateInstance calls EC2 TerminateInstances API. Must be idempotent (no error if instance already terminated).

### Step 1: Write failing test for TerminateInstance

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

Add to mockEC2Client:

```go
// Update mock to include TerminateInstances
type mockEC2Client struct {
	describeRegionsFunc     func(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error)
	describeInstancesFunc   func(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error)
	terminateInstancesFunc  func(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error)
}

func (m *mockEC2Client) TerminateInstances(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error) {
	if m.terminateInstancesFunc != nil {
		return m.terminateInstancesFunc(ctx, params, optFns...)
	}
	return &ec2.TerminateInstancesOutput{}, nil
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
			name:        "instance not found (idempotent)",
			instanceID:  "i-notfound",
			mockError:   &smithy.GenericAPIError{Code: "InvalidInstanceID.NotFound"},
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
```

Add import for smithy:

```go
import (
	"github.com/aws/smithy-go"
)
```

**Why this test:** Verifies termination works and handles NotFound error (idempotency).

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestTerminateInstance"
```

**Expected output:**

```
--- FAIL: TestTerminateInstance (0.00s)
    provider.TerminateInstance undefined
FAIL
```

### Step 3: Implement TerminateInstance

**File:** `/Users/yaroslavk/stagely/internal/providers/aws.go`

Add to existing file:

```go
import (
	"errors"

	"github.com/aws/smithy-go"
)

// TerminateInstance terminates an EC2 instance (idempotent)
func (a *AWSProvider) TerminateInstance(ctx context.Context, instanceID string) error {
	input := &ec2.TerminateInstancesInput{
		InstanceIds: []string{instanceID},
	}

	_, err := a.client.TerminateInstances(ctx, input)
	if err != nil {
		// Check if instance not found (idempotent - already terminated)
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "InvalidInstanceID.NotFound" {
			return nil // Already terminated, success
		}
		return fmt.Errorf("terminate instance: %w", err)
	}

	return nil
}
```

**Implementation notes:**

- Idempotent: returns nil if instance already terminated
- Uses errors.As to check for specific AWS API error code
- Wraps other errors for context

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestTerminateInstance"
```

**Expected output:**

```
=== RUN   TestTerminateInstance
--- PASS: TestTerminateInstance (0.00s)
PASS
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./... -v
```

**Expected:** All tests pass

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** Zero issues

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/aws.go internal/providers/aws_test.go && git commit -m "feat: implement TerminateInstance for AWS provider

- Implement TerminateInstance using EC2 API
- Handle InvalidInstanceID.NotFound for idempotency
- Add tests for successful termination and not found case

Part of Phase 1B AWS provider implementation."
```

---

## Task 7: Implement CreateInstance Method with IP Polling

**Objective:** Implement CreateInstance to launch EC2 instances and wait for public IP

**Files:**

- Modify: `/Users/yaroslavk/stagely/internal/providers/aws.go`
- Modify: `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

**Background:**
CreateInstance is the most complex method. It launches instances, handles spot requests, and polls for public IP assignment.

### Step 1: Write failing test for CreateInstance

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

Add to mockEC2Client:

```go
// Update mock to include RunInstances
type mockEC2Client struct {
	describeRegionsFunc     func(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error)
	describeInstancesFunc   func(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error)
	terminateInstancesFunc  func(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error)
	runInstancesFunc        func(ctx context.Context, params *ec2.RunInstancesInput, optFns ...func(*ec2.Options)) (*ec2.RunInstancesOutput, error)
}

func (m *mockEC2Client) RunInstances(ctx context.Context, params *ec2.RunInstancesInput, optFns ...func(*ec2.Options)) (*ec2.RunInstancesOutput, error) {
	if m.runInstancesFunc != nil {
		return m.runInstancesFunc(ctx, params, optFns...)
	}
	return &ec2.RunInstancesOutput{}, nil
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
				Size:         "", // missing required field
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

						if tt.spec.Size != "" && tt.spec.Architecture != "" {
							// Verify instance type mapping
							expectedType, _ := getInstanceType(tt.spec.Size, tt.spec.Architecture)
							assert.Equal(t, expectedType, string(params.InstanceType))

							// Verify AMI
							expectedAMI, _ := getAMI(tt.spec.Architecture)
							assert.Equal(t, expectedAMI, aws.ToString(params.ImageId))

							// Verify spot instance option
							if tt.spec.SpotInstance {
								assert.NotNil(t, params.InstanceMarketOptions)
								assert.Equal(t, types.MarketTypeSpot, params.InstanceMarketOptions.MarketType)
							}

							// Verify tags
							if len(tt.spec.Tags) > 0 {
								assert.NotEmpty(t, params.TagSpecifications)
							}

							// Verify user data
							if tt.spec.UserData != "" {
								assert.NotNil(t, params.UserData)
							}
						}

						return &ec2.RunInstancesOutput{
							Instances: []types.Instance{
								{
									InstanceId: aws.String("i-test123"),
									State:      &types.InstanceState{Name: types.InstanceStateNamePending},
									LaunchTime: &launchTime,
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
											LaunchTime:       &launchTime,
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
```

**Why this test:** Verifies CreateInstance correctly builds EC2 API request and waits for public IP.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestCreateInstance"
```

**Expected output:**

```
--- FAIL: TestCreateInstance (0.00s)
    provider.CreateInstance undefined
FAIL
```

### Step 3: Implement CreateInstance with IP polling

**File:** `/Users/yaroslavk/stagely/internal/providers/aws.go`

Add to existing file:

```go
import (
	"encoding/base64"
	"time"
)

// CreateInstance provisions a new EC2 instance
func (a *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
	// Validate spec
	if err := spec.Validate(); err != nil {
		return "", "", err
	}

	// Get instance type
	instanceType, err := getInstanceType(spec.Size, spec.Architecture)
	if err != nil {
		return "", "", err
	}

	// Get AMI
	ami, err := getAMI(spec.Architecture)
	if err != nil {
		return "", "", err
	}

	// Build tags
	tags := make([]types.Tag, 0, len(spec.Tags)+1)
	tags = append(tags, types.Tag{
		Key:   aws.String("Name"),
		Value: aws.String("stagely-vm"),
	})
	for k, v := range spec.Tags {
		tags = append(tags, types.Tag{
			Key:   aws.String(k),
			Value: aws.String(v),
		})
	}

	// Build RunInstances input
	input := &ec2.RunInstancesInput{
		ImageId:      aws.String(ami),
		InstanceType: types.InstanceType(instanceType),
		MinCount:     aws.Int32(1),
		MaxCount:     aws.Int32(1),
		TagSpecifications: []types.TagSpecification{
			{
				ResourceType: types.ResourceTypeInstance,
				Tags:         tags,
			},
		},
	}

	// Add user data if provided (must be base64 encoded)
	if spec.UserData != "" {
		encoded := base64.StdEncoding.EncodeToString([]byte(spec.UserData))
		input.UserData = aws.String(encoded)
	}

	// Handle spot instances
	if spec.SpotInstance {
		input.InstanceMarketOptions = &types.InstanceMarketOptionsRequest{
			MarketType: types.MarketTypeSpot,
		}
	}

	// Launch instance
	result, err := a.client.RunInstances(ctx, input)
	if err != nil {
		return "", "", fmt.Errorf("run instances: %w", err)
	}

	if len(result.Instances) == 0 {
		return "", "", fmt.Errorf("no instance created")
	}

	instanceID := aws.ToString(result.Instances[0].InstanceId)

	// Wait for public IP
	publicIP, err := a.waitForPublicIP(ctx, instanceID)
	if err != nil {
		return instanceID, "", fmt.Errorf("wait for public IP: %w", err)
	}

	return instanceID, publicIP, nil
}

// waitForPublicIP polls DescribeInstances until public IP is assigned
func (a *AWSProvider) waitForPublicIP(ctx context.Context, instanceID string) (string, error) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	timeout := time.After(5 * time.Minute)

	for {
		select {
		case <-timeout:
			return "", fmt.Errorf("timeout waiting for public IP after 5 minutes")
		case <-ctx.Done():
			return "", ctx.Err()
		case <-ticker.C:
			status, err := a.GetInstanceStatus(ctx, instanceID)
			if err != nil {
				// Continue polling on error (transient failures)
				continue
			}
			if status.PublicIP != "" {
				return status.PublicIP, nil
			}
		}
	}
}
```

**Implementation notes:**

- Base64 encodes user data (AWS requirement)
- Builds complete RunInstances request with all options
- Polls every 5 seconds, timeout after 5 minutes
- Returns instance ID even if IP polling fails (partial success)
- Respects context cancellation

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -run "TestCreateInstance"
```

**Expected output:**

```
=== RUN   TestCreateInstance
=== RUN   TestCreateInstance/create_small_amd64_instance
=== RUN   TestCreateInstance/create_spot_instance
=== RUN   TestCreateInstance/invalid_spec
--- PASS: TestCreateInstance (0.00s)
PASS
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./... -v
```

**Expected:** All tests pass

### Step 6: Run linter

**Command:**

```bash
cd /Users/yaroslavk/stagely && golangci-lint run ./internal/providers
```

**Expected:** Zero issues

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely && git add internal/providers/aws.go internal/providers/aws_test.go && git commit -m "feat: implement CreateInstance for AWS provider

- Implement CreateInstance with full RunInstances API integration
- Add public IP polling with 5-minute timeout
- Support spot instances via InstanceMarketOptions
- Handle user data base64 encoding
- Add comprehensive tests for all CreateInstance scenarios

Part of Phase 1B AWS provider implementation."
```

---

## Integration Testing

After all tasks complete, verify the full AWS provider implementation.

### Test: Verify AWS provider implements CloudProvider interface

**Objective:** Ensure AWSProvider satisfies CloudProvider interface at compile time

**File:** `/Users/yaroslavk/stagely/internal/providers/aws_test.go`

Add compile-time interface check:

```go
// Compile-time interface compliance check
var _ CloudProvider = (*AWSProvider)(nil)
```

**Command:**

```bash
cd /Users/yaroslavk/stagely && go build ./internal/providers
```

**Expected:** Clean build (no interface errors)

### Test: Run all provider tests

**Command:**

```bash
cd /Users/yaroslavk/stagely && go test ./internal/providers -v -race -cover
```

**Expected output:**

```
=== RUN   TestGetInstanceType
--- PASS: TestGetInstanceType
=== RUN   TestGetAMI
--- PASS: TestGetAMI
=== RUN   TestNewAWSProvider
--- PASS: TestNewAWSProvider
=== RUN   TestValidateCredentials
--- PASS: TestValidateCredentials
=== RUN   TestGetInstanceStatus
--- PASS: TestGetInstanceStatus
=== RUN   TestMapEC2State
--- PASS: TestMapEC2State
=== RUN   TestTerminateInstance
--- PASS: TestTerminateInstance
=== RUN   TestCreateInstance
--- PASS: TestCreateInstance
PASS
coverage: XX% of statements
ok      github.com/stagely-dev/stagely/internal/providers
```

---

## Verification Checklist

Before considering implementation complete:

- [x] AWS SDK dependencies added to go.mod
- [x] Instance type mapping implemented and tested
- [x] AMI selection implemented and tested
- [x] AWSProvider struct created with EC2 client
- [x] Name() method implemented
- [x] ValidateCredentials() implemented and tested
- [x] GetInstanceStatus() implemented and tested
- [x] TerminateInstance() implemented and tested (idempotent)
- [x] CreateInstance() implemented and tested
- [x] Public IP polling implemented with timeout
- [x] Spot instance support implemented
- [x] All unit tests pass
- [x] Code compiles without errors (go build ./...)
- [x] Linter passes with zero issues (golangci-lint run ./...)
- [x] No race conditions (go test -race)
- [x] Interface compliance verified (compile-time check)

---

## Rollback Plan

If issues discovered after integration:

1. **Immediate:** Revert to last stable commit before Phase 1B

   ```bash
   git log --oneline
   git revert <commit-sha>
   ```

2. **Diagnosis:**
   - Check test output for specific failure
   - Verify AWS SDK version compatibility
   - Check for breaking API changes
   - Verify mock implementations match real EC2 API

3. **Fix:**
   - For API compatibility: Update AWS SDK version
   - For logic errors: Fix specific method and add regression test
   - For interface mismatch: Update implementation

4. **Verification:**
   - Run full test suite: `go test ./... -v`
   - Run linter: `golangci-lint run ./...`
   - Test with real AWS credentials (optional, manual verification)

---

## Notes for Implementation

**Common pitfalls:**

- **Forgetting base64 encoding for UserData:** AWS requires it, test will fail without
- **Not handling NotFound errors in TerminateInstance:** Breaks idempotency requirement
- **Polling forever without timeout:** Always use timeout with context
- **Not checking ctx.Done() in polling loop:** Context cancellation won't work

**Performance considerations:**

- Public IP polling adds 5-60 seconds to instance creation
- DescribeInstances called every 5 seconds during polling (minimal cost)
- Static instance type mapping is O(1), no performance concern

**Security considerations:**

- Never log AWS access keys or secret keys
- Use static credentials initially, can extend to IAM roles later
- User data may contain secrets, don't log
- Tags visible in AWS console, avoid sensitive data

**Dependencies:**

- Requires aws-sdk-go-v2 v1.x (latest stable)
- Compatible with Go 1.22+
- No breaking changes expected in SDK minor versions

---

**Next Steps:** Begin implementation with Task 1
