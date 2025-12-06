# Stagely Cloud Provider Interface

## Overview

Stagely's pluggable cloud provider architecture allows users to provision VMs on AWS, DigitalOcean, Hetzner, Google Cloud, or any provider that supports programmatic VM creation. The system uses a Go interface abstraction that makes adding new providers straightforward.

## Design Principles

1. **Provider Agnostic**: Core logic doesn't know about specific providers
2. **User Credentials**: Users provide their own cloud API keys (BYO Cloud)
3. **Architecture Aware**: Providers map `amd64`/`arm64` to native instance types
4. **Idempotent**: Safe to call `CreateInstance()` multiple times
5. **Minimal Surface Area**: Interface has only essential methods

## Core Interface

```go
package provider

import (
    "context"
    "time"
)

// CloudProvider defines the contract for VM provisioning
type CloudProvider interface {
    // Name returns the provider identifier (e.g., "aws", "digitalocean")
    Name() string

    // CreateInstance provisions a new VM
    // Returns: instanceID, publicIP, error
    CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error)

    // GetInstanceStatus checks if VM is running
    GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error)

    // TerminateInstance destroys the VM
    TerminateInstance(ctx context.Context, instanceID string) error

    // ValidateCredentials tests if API credentials work
    ValidateCredentials(ctx context.Context) error

    // GetPricing returns cost per hour for given size/region
    GetPricing(ctx context.Context, size, region string) (float64, error)
}
```

## Data Structures

### `InstanceSpec`

Defines what kind of VM to create:

```go
type InstanceSpec struct {
    // Size: "small", "medium", "large", "xlarge"
    Size string

    // Architecture: "amd64" or "arm64"
    Architecture string

    // Region: Provider-specific (e.g., "us-east-1" for AWS)
    Region string

    // Image: OS image (usually Ubuntu 22.04)
    Image string

    // UserData: Cloud-init script (base64 encoded)
    UserData string

    // Tags: Metadata for billing/organization
    Tags map[string]string

    // SSHKeyName: Optional SSH key for debugging
    SSHKeyName string

    // SecurityGroups: Firewall rules
    SecurityGroups []string

    // SpotInstance: Use spot/preemptible pricing
    SpotInstance bool
}
```

### `InstanceStatus`

Current state of a VM:

```go
type InstanceStatus struct {
    // State: "pending", "running", "stopped", "terminated"
    State string

    // PublicIP: IPv4 address (may be empty if still booting)
    PublicIP string

    // PrivateIP: Internal IP
    PrivateIP string

    // LaunchedAt: When VM was created
    LaunchedAt time.Time

    // Ready: True if VM is accepting connections
    Ready bool
}
```

### `ProviderCredentials`

Encrypted credentials stored in database:

```go
type ProviderCredentials struct {
    ProviderType string // "aws", "gcp", etc.
    Config       map[string]string
}

// Example for AWS:
// {
//   "access_key_id": "AKIA...",
//   "secret_access_key": "...",
//   "region": "us-east-1"
// }
```

## Provider Implementations

### AWS Implementation

```go
package provider

import (
    "context"
    "encoding/base64"
    "fmt"

    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/config"
    "github.com/aws/aws-sdk-go-v2/service/ec2"
    "github.com/aws/aws-sdk-go-v2/service/ec2/types"
)

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
        return nil, err
    }

    return &AWSProvider{
        client: ec2.NewFromConfig(cfg),
        region: region,
    }, nil
}

func (p *AWSProvider) Name() string {
    return "aws"
}

func (p *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    // Map size + architecture to instance type
    instanceType := p.selectInstanceType(spec.Size, spec.Architecture)

    // Map architecture to AMI
    imageID := p.selectAMI(spec.Architecture)

    // Encode UserData
    userData := base64.StdEncoding.EncodeToString([]byte(spec.UserData))

    input := &ec2.RunInstancesInput{
        ImageId:      aws.String(imageID),
        InstanceType: types.InstanceType(instanceType),
        MinCount:     aws.Int32(1),
        MaxCount:     aws.Int32(1),
        UserData:     aws.String(userData),
        TagSpecifications: []types.TagSpecification{
            {
                ResourceType: types.ResourceTypeInstance,
                Tags: []types.Tag{
                    {Key: aws.String("Name"), Value: aws.String("Stagely-" + spec.Tags["environment_id"])},
                    {Key: aws.String("ManagedBy"), Value: aws.String("Stagely")},
                },
            },
        },
    }

    // Use spot instance if requested
    if spec.SpotInstance {
        input.InstanceMarketOptions = &types.InstanceMarketOptionsRequest{
            MarketType: types.MarketTypeSpot,
        }
    }

    result, err := p.client.RunInstances(ctx, input)
    if err != nil {
        return "", "", fmt.Errorf("failed to run instance: %w", err)
    }

    instanceID := *result.Instances[0].InstanceId

    // Wait for public IP
    publicIP, err := p.waitForPublicIP(ctx, instanceID)
    if err != nil {
        return instanceID, "", err
    }

    return instanceID, publicIP, nil
}

func (p *AWSProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
    input := &ec2.DescribeInstancesInput{
        InstanceIds: []string{instanceID},
    }

    result, err := p.client.DescribeInstances(ctx, input)
    if err != nil {
        return InstanceStatus{}, err
    }

    if len(result.Reservations) == 0 || len(result.Reservations[0].Instances) == 0 {
        return InstanceStatus{}, fmt.Errorf("instance not found")
    }

    instance := result.Reservations[0].Instances[0]

    return InstanceStatus{
        State:      string(instance.State.Name),
        PublicIP:   aws.ToString(instance.PublicIpAddress),
        PrivateIP:  aws.ToString(instance.PrivateIpAddress),
        LaunchedAt: *instance.LaunchTime,
        Ready:      instance.State.Name == types.InstanceStateNameRunning,
    }, nil
}

func (p *AWSProvider) TerminateInstance(ctx context.Context, instanceID string) error {
    input := &ec2.TerminateInstancesInput{
        InstanceIds: []string{instanceID},
    }

    _, err := p.client.TerminateInstances(ctx, input)
    return err
}

func (p *AWSProvider) ValidateCredentials(ctx context.Context) error {
    _, err := p.client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
        MaxResults: aws.Int32(1),
    })
    return err
}

func (p *AWSProvider) selectInstanceType(size, arch string) string {
    // AMD64 instances
    if arch == "amd64" {
        switch size {
        case "small":
            return "t3.small"
        case "medium":
            return "c5.xlarge"
        case "large":
            return "c5.2xlarge"
        case "xlarge":
            return "c5.4xlarge"
        }
    }

    // ARM64 instances (Graviton)
    if arch == "arm64" {
        switch size {
        case "small":
            return "t4g.small"
        case "medium":
            return "c6g.xlarge"
        case "large":
            return "c6g.2xlarge"
        case "xlarge":
            return "c6g.4xlarge"
        }
    }

    return "t3.small" // Default fallback
}

func (p *AWSProvider) selectAMI(arch string) string {
    // Ubuntu 22.04 LTS
    if arch == "amd64" {
        return "ami-0c55b159cbfafe1f0" // us-east-1
    }
    if arch == "arm64" {
        return "ami-0e6329e222e662a52" // us-east-1 ARM
    }
    return "ami-0c55b159cbfafe1f0"
}

func (p *AWSProvider) waitForPublicIP(ctx context.Context, instanceID string) (string, error) {
    for i := 0; i < 30; i++ {
        status, err := p.GetInstanceStatus(ctx, instanceID)
        if err != nil {
            return "", err
        }
        if status.PublicIP != "" {
            return status.PublicIP, nil
        }
        time.Sleep(2 * time.Second)
    }
    return "", fmt.Errorf("timeout waiting for public IP")
}

func (p *AWSProvider) GetPricing(ctx context.Context, size, region string) (float64, error) {
    // Simplified pricing (real implementation would use AWS Pricing API)
    prices := map[string]float64{
        "t3.small":    0.02,
        "c5.xlarge":   0.17,
        "c5.2xlarge":  0.34,
        "t4g.small":   0.016,
        "c6g.xlarge":  0.136,
        "c6g.2xlarge": 0.272,
    }

    instanceType := p.selectInstanceType(size, "amd64")
    if price, ok := prices[instanceType]; ok {
        return price, nil
    }
    return 0.0, fmt.Errorf("pricing not available")
}
```

### DigitalOcean Implementation

```go
package provider

import (
    "context"
    "fmt"

    "github.com/digitalocean/godo"
)

type DigitalOceanProvider struct {
    client *godo.Client
}

func NewDigitalOceanProvider(apiToken string) *DigitalOceanProvider {
    client := godo.NewFromToken(apiToken)
    return &DigitalOceanProvider{client: client}
}

func (p *DigitalOceanProvider) Name() string {
    return "digitalocean"
}

func (p *DigitalOceanProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    size := p.selectDropletSize(spec.Size, spec.Architecture)
    image := p.selectImage(spec.Architecture)

    createRequest := &godo.DropletCreateRequest{
        Name:   "stagely-" + spec.Tags["environment_id"],
        Region: spec.Region,
        Size:   size,
        Image: godo.DropletCreateImage{
            Slug: image,
        },
        UserData: spec.UserData,
        Tags: []string{"stagely", "environment:" + spec.Tags["environment_id"]},
    }

    droplet, _, err := p.client.Droplets.Create(ctx, createRequest)
    if err != nil {
        return "", "", err
    }

    // Wait for public IP
    publicIP, err := p.waitForDropletIP(ctx, droplet.ID)
    if err != nil {
        return fmt.Sprintf("%d", droplet.ID), "", err
    }

    return fmt.Sprintf("%d", droplet.ID), publicIP, nil
}

func (p *DigitalOceanProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
    dropletID, _ := strconv.Atoi(instanceID)

    droplet, _, err := p.client.Droplets.Get(ctx, dropletID)
    if err != nil {
        return InstanceStatus{}, err
    }

    publicIP, _ := droplet.PublicIPv4()

    return InstanceStatus{
        State:      droplet.Status,
        PublicIP:   publicIP,
        LaunchedAt: droplet.Created,
        Ready:      droplet.Status == "active",
    }, nil
}

func (p *DigitalOceanProvider) TerminateInstance(ctx context.Context, instanceID string) error {
    dropletID, _ := strconv.Atoi(instanceID)
    _, err := p.client.Droplets.Delete(ctx, dropletID)
    return err
}

func (p *DigitalOceanProvider) selectDropletSize(size, arch string) string {
    // DigitalOcean doesn't have ARM64 as of 2025 (fallback to AMD64)
    switch size {
    case "small":
        return "s-2vcpu-4gb"
    case "medium":
        return "c-4" // 4 vCPU, 8 GB
    case "large":
        return "c-8" // 8 vCPU, 16 GB
    default:
        return "s-2vcpu-4gb"
    }
}

func (p *DigitalOceanProvider) selectImage(arch string) string {
    return "ubuntu-22-04-x64" // Always AMD64 for now
}

func (p *DigitalOceanProvider) waitForDropletIP(ctx context.Context, dropletID int) (string, error) {
    for i := 0; i < 30; i++ {
        droplet, _, err := p.client.Droplets.Get(ctx, dropletID)
        if err != nil {
            return "", err
        }
        if ip, err := droplet.PublicIPv4(); err == nil && ip != "" {
            return ip, nil
        }
        time.Sleep(2 * time.Second)
    }
    return "", fmt.Errorf("timeout waiting for public IP")
}

func (p *DigitalOceanProvider) ValidateCredentials(ctx context.Context) error {
    _, _, err := p.client.Account.Get(ctx)
    return err
}

func (p *DigitalOceanProvider) GetPricing(ctx context.Context, size, region string) (float64, error) {
    // Simplified (real impl would query DO API)
    prices := map[string]float64{
        "s-2vcpu-4gb": 0.036,
        "c-4":         0.126,
        "c-8":         0.252,
    }
    dropletSize := p.selectDropletSize(size, "amd64")
    if price, ok := prices[dropletSize]; ok {
        return price, nil
    }
    return 0.0, fmt.Errorf("pricing not available")
}
```

### Hetzner Implementation

```go
package provider

import (
    "context"
    "fmt"

    "github.com/hetznercloud/hcloud-go/hcloud"
)

type HetznerProvider struct {
    client *hcloud.Client
}

func NewHetznerProvider(apiToken string) *HetznerProvider {
    return &HetznerProvider{
        client: hcloud.NewClient(hcloud.WithToken(apiToken)),
    }
}

func (p *HetznerProvider) Name() string {
    return "hetzner"
}

func (p *HetznerProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    serverType := p.selectServerType(spec.Size, spec.Architecture)
    image := p.selectImage(spec.Architecture)

    createOpts := hcloud.ServerCreateOpts{
        Name: "stagely-" + spec.Tags["environment_id"],
        ServerType: &hcloud.ServerType{Name: serverType},
        Image: &hcloud.Image{Name: image},
        Location: &hcloud.Location{Name: spec.Region},
        UserData: spec.UserData,
        Labels: map[string]string{
            "managed_by":     "stagely",
            "environment_id": spec.Tags["environment_id"],
        },
    }

    result, _, err := p.client.Server.Create(ctx, createOpts)
    if err != nil {
        return "", "", err
    }

    return fmt.Sprintf("%d", result.Server.ID), result.Server.PublicNet.IPv4.IP.String(), nil
}

func (p *HetznerProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
    serverID, _ := strconv.ParseInt(instanceID, 10, 64)

    server, _, err := p.client.Server.GetByID(ctx, serverID)
    if err != nil {
        return InstanceStatus{}, err
    }

    return InstanceStatus{
        State:      string(server.Status),
        PublicIP:   server.PublicNet.IPv4.IP.String(),
        LaunchedAt: server.Created,
        Ready:      server.Status == hcloud.ServerStatusRunning,
    }, nil
}

func (p *HetznerProvider) TerminateInstance(ctx context.Context, instanceID string) error {
    serverID, _ := strconv.ParseInt(instanceID, 10, 64)
    _, err := p.client.Server.Delete(ctx, &hcloud.Server{ID: serverID})
    return err
}

func (p *HetznerProvider) selectServerType(size, arch string) string {
    // Hetzner supports ARM64 via "cax" series
    if arch == "arm64" {
        switch size {
        case "small":
            return "cax11" // 2 vCPU, 4 GB
        case "medium":
            return "cax21" // 4 vCPU, 8 GB
        case "large":
            return "cax31" // 8 vCPU, 16 GB
        }
    }

    // AMD64
    switch size {
    case "small":
        return "cx21" // 2 vCPU, 4 GB
    case "medium":
        return "cx31" // 2 vCPU, 8 GB
    case "large":
        return "cx41" // 4 vCPU, 16 GB
    }

    return "cx21"
}

func (p *HetznerProvider) selectImage(arch string) string {
    if arch == "arm64" {
        return "ubuntu-22.04-arm"
    }
    return "ubuntu-22.04"
}

func (p *HetznerProvider) ValidateCredentials(ctx context.Context) error {
    _, _, err := p.client.Server.List(ctx, hcloud.ServerListOpts{ListOpts: hcloud.ListOpts{PerPage: 1}})
    return err
}

func (p *HetznerProvider) GetPricing(ctx context.Context, size, region string) (float64, error) {
    prices := map[string]float64{
        "cx21":  0.005,
        "cx31":  0.010,
        "cx41":  0.019,
        "cax11": 0.004,
        "cax21": 0.008,
        "cax31": 0.015,
    }
    serverType := p.selectServerType(size, "amd64")
    if price, ok := prices[serverType]; ok {
        return price, nil
    }
    return 0.0, fmt.Errorf("pricing not available")
}
```

## Provider Registry

Centralized registry for all providers:

```go
package provider

import (
    "fmt"
    "sync"
)

type Registry struct {
    providers map[string]func(map[string]string) (CloudProvider, error)
    mu        sync.RWMutex
}

var globalRegistry = &Registry{
    providers: make(map[string]func(map[string]string) (CloudProvider, error)),
}

func Register(name string, factory func(map[string]string) (CloudProvider, error)) {
    globalRegistry.mu.Lock()
    defer globalRegistry.mu.Unlock()
    globalRegistry.providers[name] = factory
}

func Get(name string, credentials map[string]string) (CloudProvider, error) {
    globalRegistry.mu.RLock()
    factory, ok := globalRegistry.providers[name]
    globalRegistry.mu.RUnlock()

    if !ok {
        return nil, fmt.Errorf("unknown provider: %s", name)
    }

    return factory(credentials)
}

func init() {
    // Register all providers
    Register("aws", func(creds map[string]string) (CloudProvider, error) {
        return NewAWSProvider(
            creds["access_key_id"],
            creds["secret_access_key"],
            creds["region"],
        )
    })

    Register("digitalocean", func(creds map[string]string) (CloudProvider, error) {
        return NewDigitalOceanProvider(creds["api_token"]), nil
    })

    Register("hetzner", func(creds map[string]string) (CloudProvider, error) {
        return NewHetznerProvider(creds["api_token"]), nil
    })
}
```

## Usage in Core

```go
package core

import "stagely/provider"

func (o *Orchestrator) ProvisionVM(spec provider.InstanceSpec, providerConfig ProviderConfig) error {
    // Decrypt credentials
    creds, err := o.DecryptCredentials(providerConfig.EncryptedCredentials)
    if err != nil {
        return err
    }

    // Get provider
    p, err := provider.Get(providerConfig.ProviderType, creds)
    if err != nil {
        return err
    }

    // Create instance
    instanceID, publicIP, err := p.CreateInstance(context.Background(), spec)
    if err != nil {
        return err
    }

    log.Printf("Provisioned %s instance %s at %s", p.Name(), instanceID, publicIP)
    return nil
}
```

## Handling Provider-Specific Features

### Spot Instances (AWS)

```go
spec := provider.InstanceSpec{
    Size:         "medium",
    Architecture: "amd64",
    SpotInstance: true, // Use spot pricing
}
```

### Custom Images

```go
spec := provider.InstanceSpec{
    Image: "ami-custom-ubuntu-docker", // User-provided AMI
}
```

### VPC/Networking

```go
spec := provider.InstanceSpec{
    VPC:            "vpc-abc123",
    Subnet:         "subnet-def456",
    SecurityGroups: []string{"sg-stagely"},
}
```

## Error Handling

### Quota Exceeded

```go
_, _, err := provider.CreateInstance(ctx, spec)
if err != nil {
    if strings.Contains(err.Error(), "quota exceeded") {
        return fmt.Errorf("cloud provider quota exceeded, contact support")
    }
}
```

### Invalid Credentials

```go
err := provider.ValidateCredentials(ctx)
if err != nil {
    return fmt.Errorf("invalid cloud credentials: %w", err)
}
```

## Testing

### Mock Provider

```go
type MockProvider struct {
    instances map[string]InstanceStatus
}

func (m *MockProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    id := "mock-" + uuid.New().String()
    m.instances[id] = InstanceStatus{
        State:    "running",
        PublicIP: "203.0.113.1",
        Ready:    true,
    }
    return id, "203.0.113.1", nil
}

func (m *MockProvider) TerminateInstance(ctx context.Context, instanceID string) error {
    delete(m.instances, instanceID)
    return nil
}
```

### Integration Tests

```go
func TestAWSProvider(t *testing.T) {
    if testing.Short() {
        t.Skip("Skipping integration test")
    }

    provider, err := NewAWSProvider(os.Getenv("AWS_ACCESS_KEY"), os.Getenv("AWS_SECRET_KEY"), "us-east-1")
    require.NoError(t, err)

    spec := InstanceSpec{
        Size:         "small",
        Architecture: "amd64",
        Region:       "us-east-1",
        UserData:     "#!/bin/bash\necho 'Hello World'",
        Tags: map[string]string{
            "test": "true",
        },
    }

    instanceID, publicIP, err := provider.CreateInstance(context.Background(), spec)
    require.NoError(t, err)
    defer provider.TerminateInstance(context.Background(), instanceID)

    assert.NotEmpty(t, instanceID)
    assert.NotEmpty(t, publicIP)
}
```

## Adding a New Provider

### Step 1: Implement Interface

Create `provider/my_provider.go`:

```go
type MyProvider struct {
    // ...
}

func (p *MyProvider) Name() string {
    return "myprovider"
}

// Implement all interface methods
```

### Step 2: Register Provider

```go
func init() {
    provider.Register("myprovider", func(creds map[string]string) (CloudProvider, error) {
        return NewMyProvider(creds["api_key"]), nil
    })
}
```

### Step 3: Update Database Enum

```sql
ALTER TABLE cloud_providers
DROP CONSTRAINT valid_provider;

ALTER TABLE cloud_providers
ADD CONSTRAINT valid_provider CHECK (
    provider_type IN ('aws', 'gcp', 'digitalocean', 'hetzner', 'linode', 'myprovider')
);
```

### Step 4: Add to Dashboard UI

```typescript
// frontend/src/types.ts
export type CloudProvider = 'aws' | 'gcp' | 'digitalocean' | 'hetzner' | 'myprovider';

// frontend/src/components/CloudProviderForm.tsx
<option value="myprovider">My Provider</option>
```

## Security Considerations

### Credential Encryption

```go
func (s *Service) StoreCredentials(providerType string, creds map[string]string) error {
    // Serialize to JSON
    credsJSON, _ := json.Marshal(creds)

    // Encrypt with AES-256-GCM
    encrypted, err := s.Encrypt(credsJSON)
    if err != nil {
        return err
    }

    // Store in database
    return s.DB.Exec("INSERT INTO cloud_providers (provider_type, encrypted_credentials) VALUES (?, ?)",
        providerType, encrypted)
}
```

### Least Privilege IAM

**AWS Example:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:DescribeInstances",
        "ec2:CreateTags"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/ManagedBy": "Stagely"
        }
      }
    }
  ]
}
```

### Rate Limiting

Prevent abuse by limiting API calls:

```go
func (p *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    // Check rate limit
    if !p.rateLimit.Allow() {
        return "", "", fmt.Errorf("rate limit exceeded, try again in 1 minute")
    }

    // ... rest of implementation
}
```

## Observability

### Metrics

```go
var (
    provisionDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "stagely_provision_duration_seconds",
            Help: "Time to provision a VM",
        },
        []string{"provider", "size", "architecture"},
    )

    provisionErrors = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "stagely_provision_errors_total",
            Help: "Total provision errors",
        },
        []string{"provider", "error_type"},
    )
)

func (p *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
    start := time.Now()
    defer func() {
        provisionDuration.WithLabelValues("aws", spec.Size, spec.Architecture).Observe(time.Since(start).Seconds())
    }()

    // ... implementation
}
```

### Logging

```go
log.Info("provisioning VM",
    "provider", "aws",
    "size", spec.Size,
    "architecture", spec.Architecture,
    "region", spec.Region,
)
```

## Cost Tracking

Track estimated costs per environment:

```go
func (o *Orchestrator) EstimateCost(environmentID string) (float64, error) {
    env, _ := o.DB.GetEnvironment(environmentID)
    provider, _ := o.GetProvider(env.CloudProviderID)

    hourlyRate, err := provider.GetPricing(context.Background(), env.Size, env.Region)
    if err != nil {
        return 0, err
    }

    hoursAlive := time.Since(env.CreatedAt).Hours()
    return hourlyRate * hoursAlive, nil
}
```

## Future Enhancements

1. **Auto-Scaling**: Dynamically resize VMs based on load
2. **Multi-Region Failover**: Provision in fallback region if primary fails
3. **Cost Optimization**: Automatically select cheapest provider for given size
4. **VM Pooling**: Keep warm VMs ready for instant provisioning
5. **Kubernetes Support**: Provision pods instead of VMs
