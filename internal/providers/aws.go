package providers

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/smithy-go"
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

// EC2API defines the EC2 operations used by the provider (interface for mocking)
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

// NewAWSProvider creates a new AWS provider with the given credentials and region.
func NewAWSProvider(accessKey, secretKey, region string) (*AWSProvider, error) {
	if accessKey == "" {
		return nil, fmt.Errorf("access key is required")
	}
	if secretKey == "" {
		return nil, fmt.Errorf("secret key is required")
	}
	if region == "" {
		return nil, fmt.Errorf("region is required")
	}

	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKey,
			secretKey,
			"",
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

// Name returns the provider identifier.
func (a *AWSProvider) Name() string {
	return "aws"
}

// ValidateCredentials verifies that the AWS credentials are valid.
func (a *AWSProvider) ValidateCredentials(ctx context.Context) error {
	_, err := a.client.DescribeRegions(ctx, &ec2.DescribeRegionsInput{})
	if err != nil {
		return ErrInvalidCredentials
	}
	return nil
}

// CreateInstance provisions a new EC2 instance.
func (a *AWSProvider) CreateInstance(ctx context.Context, spec InstanceSpec) (string, string, error) {
	if err := spec.Validate(); err != nil {
		return "", "", err
	}

	instanceType, err := getInstanceType(spec.Size, spec.Architecture)
	if err != nil {
		return "", "", err
	}

	ami, err := getAMI(spec.Architecture)
	if err != nil {
		return "", "", err
	}

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

	if spec.UserData != "" {
		encoded := base64.StdEncoding.EncodeToString([]byte(spec.UserData))
		input.UserData = aws.String(encoded)
	}

	if spec.SpotInstance {
		input.InstanceMarketOptions = &types.InstanceMarketOptionsRequest{
			MarketType: types.MarketTypeSpot,
		}
	}

	result, err := a.client.RunInstances(ctx, input)
	if err != nil {
		return "", "", fmt.Errorf("run instances: %w", err)
	}

	if len(result.Instances) == 0 {
		return "", "", fmt.Errorf("no instance created")
	}

	instanceID := aws.ToString(result.Instances[0].InstanceId)

	publicIP, err := a.waitForPublicIP(ctx, instanceID)
	if err != nil {
		return instanceID, "", fmt.Errorf("wait for public IP: %w", err)
	}

	return instanceID, publicIP, nil
}

// waitForPublicIP polls DescribeInstances until a public IP is assigned or timeout occurs.
func (a *AWSProvider) waitForPublicIP(ctx context.Context, instanceID string) (string, error) {
	// Quick initial check before starting the ticker to avoid needless delay.
	status, err := a.GetInstanceStatus(ctx, instanceID)
	if err == nil && status.PublicIP != "" {
		return status.PublicIP, nil
	}

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
			currentStatus, statusErr := a.GetInstanceStatus(ctx, instanceID)
			if statusErr != nil {
				continue
			}
			if currentStatus.PublicIP != "" {
				return currentStatus.PublicIP, nil
			}
		}
	}
}

// GetInstanceStatus returns the current status of an EC2 instance.
func (a *AWSProvider) GetInstanceStatus(ctx context.Context, instanceID string) (InstanceStatus, error) {
	result, err := a.client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{instanceID},
	})
	if err != nil {
		return InstanceStatus{}, fmt.Errorf("describe instances: %w", err)
	}

	if len(result.Reservations) == 0 || len(result.Reservations[0].Instances) == 0 {
		return InstanceStatus{}, ErrInstanceNotFound
	}

	instance := result.Reservations[0].Instances[0]

	return InstanceStatus{
		State:      mapEC2State(instance.State.Name),
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

// TerminateInstance terminates an EC2 instance (idempotent).
func (a *AWSProvider) TerminateInstance(ctx context.Context, instanceID string) error {
	_, err := a.client.TerminateInstances(ctx, &ec2.TerminateInstancesInput{
		InstanceIds: []string{instanceID},
	})
	if err != nil {
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "InvalidInstanceID.NotFound" {
			return nil
		}
		return fmt.Errorf("terminate instance: %w", err)
	}
	return nil
}

// getInstanceType returns the EC2 instance type for the given size and architecture.
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

// getAMI returns the Ubuntu 22.04 LTS AMI ID for the given architecture.
func getAMI(arch string) (string, error) {
	ami, ok := amiMap[arch]
	if !ok {
		return "", fmt.Errorf("unsupported architecture: %s", arch)
	}
	return ami, nil
}
