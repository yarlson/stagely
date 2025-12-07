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
