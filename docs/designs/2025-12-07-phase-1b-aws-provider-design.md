# AWS Provider Implementation Design

> **Status:** Ready for Implementation
> **Phase:** 1B - AWS Provider Implementation
> **Created:** 2025-12-07
> **Roadmap:** docs/roadmaps/2025-12-06-stagely-core-roadmap.md

## Overview

### Problem Statement

Stagely needs to provision EC2 instances on AWS with proper instance type selection based on size and architecture, AMI selection based on architecture (Ubuntu 22.04), spot instance support, and public IP polling. The AWS provider must implement the CloudProvider interface defined in Phase 1A.

### Goals

- Implement CloudProvider interface for AWS using aws-sdk-go-v2
- Map generic sizes (small/medium/large) to appropriate EC2 instance types
- Support both AMD64 and ARM64 architectures with proper instance type selection
- Handle Ubuntu 22.04 AMI selection based on architecture
- Support spot instance requests
- Poll for public IP assignment with timeout
- Provide comprehensive error handling

### Non-Goals

- Multi-region AMI discovery (will use hardcoded AMI IDs for initial implementation)
- Reserved instance support
- Custom VPC configuration (will use default VPC)
- Auto Scaling Group integration
- Advanced networking features (Elastic IPs, security groups beyond defaults)

### Success Criteria

- AWS provider fully implements CloudProvider interface
- Instance type mapping works for all size/architecture combinations
- AMI selection correctly chooses Ubuntu 22.04 for AMD64 and ARM64
- Spot instance requests function properly
- Public IP polling completes within reasonable timeout (5 minutes)
- All tests pass with mocked EC2 client
- Zero golangci-lint issues

## Architecture

### High-Level Design

The AWS provider will be implemented as a struct that holds an EC2 client and configuration. It will implement all CloudProvider interface methods by translating generic instance specifications into AWS-specific API calls.

Key responsibilities:

- Map size + architecture → EC2 instance type (t3.small, t4g.small, c5.xlarge, etc.)
- Select appropriate AMI ID based on architecture
- Handle EC2 API calls (RunInstances, DescribeInstances, TerminateInstances)
- Poll for public IP assignment after instance launch
- Normalize EC2 instance state to CloudProvider state constants

### Technology Choices

**AWS SDK v2:** Using `github.com/aws/aws-sdk-go-v2` (latest official Go SDK)

- Better error handling than v1
- Context-aware by default
- More idiomatic Go patterns
- Better performance and smaller binaries

**AMI Strategy:** Hardcoded AMI IDs for us-east-1 region initially

- Simplifies implementation
- Avoids AMI discovery overhead
- Can be extended to dynamic lookup later
- Ubuntu 22.04 LTS images are stable

**Instance Type Mapping:** Static mapping based on size + architecture

- Predictable and testable
- Easy to understand and maintain
- Can be made configurable later if needed

### Component Structure

```
internal/providers/
├── provider.go        (interface definition - existing)
├── aws.go             (AWS implementation - NEW)
└── aws_test.go        (tests with mocked EC2 - NEW)
```

## Design Decisions

### Decision 1: Static Instance Type Mapping

**Chosen Approach:** Hardcoded map[size][arch] → instance type

**Alternatives Considered:**

1. Dynamic pricing-based selection (query AWS Pricing API)
2. Configuration file-based mapping
3. User-specified instance types

**Rationale:**

- YAGNI: Static mapping is sufficient for MVP
- Simplicity: Easy to understand and test
- Performance: No API calls needed for mapping
- Predictability: Users know exactly what they get

**Trade-offs:**

- Less flexible than dynamic selection
- Requires code change to update mappings
- Cannot optimize for price changes
- Acceptable: Can extend later if needed

**Mapping:**

```
Small + AMD64  → t3.small   (2 vCPU, 2GB RAM)
Small + ARM64  → t4g.small  (2 vCPU, 2GB RAM)
Medium + AMD64 → c5.xlarge  (4 vCPU, 8GB RAM)
Medium + ARM64 → c6g.xlarge (4 vCPU, 8GB RAM)
Large + AMD64  → c5.2xlarge (8 vCPU, 16GB RAM)
Large + ARM64  → c6g.2xlarge(8 vCPU, 16GB RAM)
```

**Reasoning:**

- Small: t3/t4g for burst workloads, cost-effective for preview envs
- Medium: c5/c6g compute-optimized for build workloads
- Large: c5/c6g 2xlarge for larger builds

### Decision 2: Hardcoded AMI IDs

**Chosen Approach:** Hardcoded Ubuntu 22.04 AMI IDs for us-east-1

**Alternatives Considered:**

1. SSM Parameter Store lookup (AWS-maintained AMI IDs)
2. DescribeImages API call with filters
3. Multi-region AMI mapping

**Rationale:**

- YAGNI: Single region sufficient for MVP
- Simplicity: No additional API calls
- Speed: Instant provisioning (no AMI lookup delay)
- Reliability: Known working AMIs

**Trade-offs:**

- Must update code when AMIs change
- Only supports us-east-1 initially
- Cannot auto-upgrade to newer Ubuntu versions
- Acceptable: AMIs change infrequently, can extend later

**AMI IDs (us-east-1, Ubuntu 22.04 LTS):**

```
AMD64: ami-0c7217cdde317cfec (as of Dec 2025)
ARM64: ami-0c7a8e3f05e4e5f0c (as of Dec 2025)
```

### Decision 3: Public IP Polling Strategy

**Chosen Approach:** Poll DescribeInstances every 5 seconds, timeout after 5 minutes

**Alternatives Considered:**

1. AWS Waiters (built-in SDK waiters)
2. Event-driven (EC2 state change notifications)
3. Return immediately, let caller poll

**Rationale:**

- Control: Custom polling gives us exact control over timeout and interval
- Simplicity: No additional infrastructure needed
- Visibility: Can log each poll attempt for debugging
- Consistency: Same pattern can be used for other providers

**Trade-offs:**

- More API calls than waiters (acceptable, low cost)
- Not event-driven (acceptable for MVP)
- Caller blocks during polling (expected behavior)

**Implementation:**

```go
func (a *AWSProvider) waitForPublicIP(ctx context.Context, instanceID string) (string, error) {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    timeout := time.After(5 * time.Minute)

    for {
        select {
        case <-timeout:
            return "", errors.New("timeout waiting for public IP")
        case <-ticker.C:
            status, err := a.GetInstanceStatus(ctx, instanceID)
            if err != nil {
                continue // retry on error
            }
            if status.PublicIP != "" {
                return status.PublicIP, nil
            }
        case <-ctx.Done():
            return "", ctx.Err()
        }
    }
}
```

### Decision 4: Spot Instance Handling

**Chosen Approach:** Use RequestSpotInstances API when SpotInstance=true

**Alternatives Considered:**

1. Spot Fleet
2. EC2 Instance with spot market type
3. No spot support (on-demand only)

**Rationale:**

- Simplicity: RequestSpotInstances is straightforward
- Flexibility: Can set max price (default to on-demand price)
- Compatibility: Works with existing instance type mapping
- Cost Savings: Significant for build VMs (ephemeral, fault-tolerant)

**Trade-offs:**

- Spot interruptions possible (acceptable for builds)
- Slightly more complex than on-demand
- May fail if no spot capacity (can fallback to on-demand later)

## Component Details

### AWSProvider Struct

```go
type AWSProvider struct {
    client *ec2.Client
    region string
}

func NewAWSProvider(accessKey, secretKey, region string) (*AWSProvider, error) {
    cfg, err := config.LoadDefaultConfig(context.Background(),
        config.WithRegion(region),
        config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
            accessKey, secretKey, "",
        )),
    )
    if err != nil {
        return nil, fmt.Errorf("aws config: %w", err)
    }

    return &AWSProvider{
        client: ec2.NewFromConfig(cfg),
        region: region,
    }, nil
}
```

**Responsibilities:**

- Hold EC2 client and region config
- Translate CloudProvider calls to EC2 API calls
- Handle AWS-specific error codes

**Dependencies:**

- aws-sdk-go-v2/service/ec2
- aws-sdk-go-v2/config
- aws-sdk-go-v2/credentials

### Instance Type Mapping

```go
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

func (a *AWSProvider) getInstanceType(size, arch string) (string, error) {
    archMap, ok := instanceTypeMap[size]
    if !ok {
        return "", fmt.Errorf("unsupported size: %s", size)
    }
    instanceType, ok := archMap[arch]
    if !ok {
        return "", fmt.Errorf("unsupported architecture: %s", arch)
    }
    return instanceType, nil
}
```

### AMI Selection

```go
var amiMap = map[string]string{
    ArchAMD64: "ami-0c7217cdde317cfec", // Ubuntu 22.04 LTS AMD64
    ArchARM64: "ami-0c7a8e3f05e4e5f0c", // Ubuntu 22.04 LTS ARM64
}

func (a *AWSProvider) getAMI(arch string) (string, error) {
    ami, ok := amiMap[arch]
    if !ok {
        return "", fmt.Errorf("unsupported architecture: %s", arch)
    }
    return ami, nil
}
```

### CreateInstance Implementation

```go
func (a *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    // Validate spec
    if err := spec.Validate(); err != nil {
        return "", "", err
    }

    // Get instance type
    instanceType, err := a.getInstanceType(spec.Size, spec.Architecture)
    if err != nil {
        return "", "", err
    }

    // Get AMI
    ami, err := a.getAMI(spec.Architecture)
    if err != nil {
        return "", "", err
    }

    // Build tags
    tags := make([]types.Tag, 0, len(spec.Tags)+1)
    tags = append(tags, types.Tag{Key: aws.String("Name"), Value: aws.String("stagely-vm")})
    for k, v := range spec.Tags {
        tags = append(tags, types.Tag{Key: aws.String(k), Value: aws.String(v)})
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

    // Add user data if provided
    if spec.UserData != "" {
        input.UserData = aws.String(base64.StdEncoding.EncodeToString([]byte(spec.UserData)))
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
        return "", "", errors.New("no instance created")
    }

    instanceID := aws.ToString(result.Instances[0].InstanceId)

    // Wait for public IP
    publicIP, err := a.waitForPublicIP(ctx, instanceID)
    if err != nil {
        return instanceID, "", fmt.Errorf("wait for public IP: %w", err)
    }

    return instanceID, publicIP, nil
}
```

### GetInstanceStatus Implementation

```go
func (a *AWSProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
    input := &ec2.DescribeInstancesInput{
        InstanceIds: []string{instanceID},
    }

    result, err := a.client.DescribeInstances(ctx, input)
    if err != nil {
        return InstanceStatus{}, fmt.Errorf("describe instances: %w", err)
    }

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

### TerminateInstance Implementation

```go
func (a *AWSProvider) TerminateInstance(ctx context.Context, instanceID string) error {
    input := &ec2.TerminateInstancesInput{
        InstanceIds: []string{instanceID},
    }

    _, err := a.client.TerminateInstances(ctx, input)
    if err != nil {
        // Check if instance not found (idempotent)
        var apiErr smithy.APIError
        if errors.As(err, &apiErr) && apiErr.ErrorCode() == "InvalidInstanceID.NotFound" {
            return nil // Already terminated, success
        }
        return fmt.Errorf("terminate instance: %w", err)
    }

    return nil
}
```

### ValidateCredentials Implementation

```go
func (a *AWSProvider) ValidateCredentials(ctx context.Context) error {
    // Make lightweight API call (describe regions)
    input := &ec2.DescribeRegionsInput{}
    _, err := a.client.DescribeRegions(ctx, input)
    if err != nil {
        return ErrInvalidCredentials
    }
    return nil
}
```

### Name Implementation

```go
func (a *AWSProvider) Name() string {
    return "aws"
}
```

## Error Handling

### Error Scenarios

1. **Invalid Credentials**
   - Detection: API call returns auth error
   - Response: Return ErrInvalidCredentials
   - Recovery: User must update credentials

2. **Quota Exceeded**
   - Detection: API returns quota/limit error
   - Response: Return ErrQuotaExceeded
   - Recovery: User must request quota increase or terminate instances

3. **Network Timeout**
   - Detection: Context deadline exceeded or network error
   - Response: Return ErrNetworkFailure
   - Recovery: Caller should retry

4. **Invalid Instance Type**
   - Detection: RunInstances returns unsupported instance type error
   - Response: Return detailed error with instance type
   - Recovery: Check mapping, update if AWS changed offerings

5. **No Spot Capacity**
   - Detection: Spot request fails
   - Response: Return error indicating no capacity
   - Recovery: Retry with on-demand or different instance type

6. **Public IP Timeout**
   - Detection: 5 minute timeout expires
   - Response: Return instance ID but empty IP, specific error
   - Recovery: Caller can poll later or terminate

### Error Wrapping

All AWS errors will be wrapped with context:

```go
if err != nil {
    return fmt.Errorf("operation description: %w", err)
}
```

This preserves error chain for:

- Debugging
- Error type checking (errors.Is, errors.As)
- Structured logging

## Testing Strategy

### Unit Tests

**Test: Instance Type Mapping**

```go
func TestGetInstanceType(t *testing.T) {
    testCases := []struct{
        size, arch, expected string
        expectError bool
    }{
        {SizeSmall, ArchAMD64, "t3.small", false},
        {SizeSmall, ArchARM64, "t4g.small", false},
        {SizeMedium, ArchAMD64, "c5.xlarge", false},
        {SizeMedium, ArchARM64, "c6g.xlarge", false},
        {SizeLarge, ArchAMD64, "c5.2xlarge", false},
        {SizeLarge, ArchARM64, "c6g.2xlarge", false},
        {"invalid", ArchAMD64, "", true},
        {SizeSmall, "invalid", "", true},
    }
    // ... test each case
}
```

**Test: AMI Selection**

```go
func TestGetAMI(t *testing.T) {
    // Test AMD64 returns correct AMI
    // Test ARM64 returns correct AMI
    // Test invalid arch returns error
}
```

**Test: EC2 State Mapping**

```go
func TestMapEC2State(t *testing.T) {
    // Test all EC2 states map to CloudProvider states correctly
}
```

### Integration Tests (Mocked EC2)

**Test: CreateInstance Success**

```go
func TestCreateInstance(t *testing.T) {
    // Mock EC2 client that returns successful RunInstances response
    // Call CreateInstance with valid spec
    // Verify RunInstances called with correct parameters
    // Verify instance ID and IP returned
}
```

**Test: CreateInstance with Spot**

```go
func TestCreateInstanceSpot(t *testing.T) {
    // Mock EC2 client
    // Call CreateInstance with SpotInstance=true
    // Verify InstanceMarketOptions set correctly
}
```

**Test: GetInstanceStatus**

```go
func TestGetInstanceStatus(t *testing.T) {
    // Mock DescribeInstances response
    // Call GetInstanceStatus
    // Verify status fields correct
}
```

**Test: TerminateInstance**

```go
func TestTerminateInstance(t *testing.T) {
    // Mock successful termination
    // Verify TerminateInstances called
}
```

**Test: TerminateInstance Idempotent**

```go
func TestTerminateInstanceNotFound(t *testing.T) {
    // Mock NotFound error
    // Verify no error returned (idempotent)
}
```

**Test: ValidateCredentials**

```go
func TestValidateCredentials(t *testing.T) {
    // Mock successful DescribeRegions
    // Verify no error
    // Mock auth error
    // Verify ErrInvalidCredentials returned
}
```

### Edge Cases

- Empty UserData (should work)
- Very long UserData (test size limits)
- Invalid region (error)
- Concurrent CreateInstance calls (thread safety)
- Context cancellation during provisioning
- Public IP never assigned (timeout)
- Network errors during polling (retries)

### Mocking Strategy

Use interface-based mocking for ec2.Client:

```go
type EC2API interface {
    RunInstances(ctx context.Context, params *ec2.RunInstancesInput, optFns ...func(*ec2.Options)) (*ec2.RunInstancesOutput, error)
    DescribeInstances(ctx context.Context, params *ec2.DescribeInstancesInput, optFns ...func(*ec2.Options)) (*ec2.DescribeInstancesOutput, error)
    TerminateInstances(ctx context.Context, params *ec2.TerminateInstancesInput, optFns ...func(*ec2.Options)) (*ec2.TerminateInstancesOutput, error)
    DescribeRegions(ctx context.Context, params *ec2.DescribeRegionsInput, optFns ...func(*ec2.Options)) (*ec2.DescribeRegionsOutput, error)
}
```

This allows test doubles without external dependencies.

## Implementation Considerations

### Potential Challenges

1. **AMI IDs Change Over Time**
   - Solution: Document update process, consider SSM lookup in future
   - Impact: Low (AMIs stable for years)

2. **Spot Instance Availability**
   - Solution: Clear error messages, document fallback to on-demand
   - Impact: Medium (affects cost optimization)

3. **Public IP Assignment Delays**
   - Solution: Generous 5 minute timeout, configurable in future
   - Impact: Low (rare for public IPs to take >2 minutes)

4. **Region-Specific Constraints**
   - Solution: Hardcode to us-east-1 for now, extend later
   - Impact: Low (most users in us-east-1)

### Areas Needing Special Attention

1. **Error Handling:** AWS SDK v2 uses typed errors, must handle correctly
2. **Context Propagation:** All API calls must respect context cancellation
3. **Polling Logic:** Must not leak goroutines, proper cleanup
4. **Credential Security:** Never log access keys/secret keys

### Dependencies

**Go Modules:**

- github.com/aws/aws-sdk-go-v2/config
- github.com/aws/aws-sdk-go-v2/credentials
- github.com/aws/aws-sdk-go-v2/service/ec2
- github.com/aws/smithy-go (transitive, for error handling)

**Existing Code:**

- internal/providers/provider.go (CloudProvider interface)

## Future Enhancements

### Features Intentionally Deferred

1. **Dynamic AMI Discovery**
   - Use SSM Parameter Store for AWS-managed AMI IDs
   - Benefit: Auto-update to latest AMIs
   - Deferral Reason: YAGNI, adds complexity

2. **Multi-Region Support**
   - Region-specific AMI mapping
   - Regional endpoint configuration
   - Benefit: Global deployment
   - Deferral Reason: MVP targets single region

3. **Custom VPC Configuration**
   - User-specified VPC/subnet
   - Custom security groups
   - Benefit: Network isolation
   - Deferral Reason: Default VPC sufficient for MVP

4. **Reserved Instance Utilization**
   - Prefer reserved instances if available
   - Benefit: Cost savings
   - Deferral Reason: Complex usage tracking

5. **Auto-Retry with Backoff**
   - Exponential backoff for transient errors
   - Benefit: Better reliability
   - Deferral Reason: Caller can implement retry

6. **Placement Groups**
   - Low-latency instance placement
   - Benefit: Performance
   - Deferral Reason: Not needed for ephemeral VMs

### Extension Points

- Instance type mapping can be made configurable (config file or database)
- AMI selection can be extended to SSM lookup
- Region can be made per-instance instead of per-provider
- Polling interval/timeout can be made configurable

### Migration Considerations

- If AMI IDs change, update constants and redeploy
- If instance types deprecated, update mapping
- If adding multi-region, extend AMI map to map[region][arch]string

## Summary

This design provides a solid, testable AWS provider implementation that:

- Follows SOLID principles (single responsibility, dependency inversion)
- Implements DRY (instance type and AMI mapping extracted)
- Applies YAGNI (no speculative features)
- Prioritizes simplicity and maintainability
- Provides clear error handling
- Enables comprehensive testing with mocks

The implementation will be straightforward to extend in future phases while providing all necessary functionality for Phase 1B.
