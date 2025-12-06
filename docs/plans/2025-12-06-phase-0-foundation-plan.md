# Phase 0: Foundation Implementation Plan

> **Status:** Ready for implementation
> **Design:** docs/designs/2025-12-06-phase-0-foundation-design.md

**Goal:** Establish foundational Go project structure, database schema, configuration management, and core utilities for Stagely Core.

**Architecture:** Migrations-first approach with GORM models, Viper configuration, AES-256-GCM encryption, and NanoID generation. Standard Go project layout with testcontainers for integration testing.

**Tech Stack:**

- Go 1.22+
- PostgreSQL 14+ via GORM v1.25+
- Viper for configuration
- golang-migrate for migrations
- testcontainers-go for integration tests
- testify for assertions

**Prerequisites:**

- Go 1.22+ installed
- Docker and Docker Compose installed
- Make installed
- `migrate` CLI: `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`

---

## Task 1: Project Initialization

**Objective:** Initialize Go module, create directory structure, and set up Makefile

**Files:**

- Create: `/Users/yaroslavk/stagely/go.mod`
- Create: `/Users/yaroslavk/stagely/Makefile`
- Create: directory structure (cmd, internal, pkg, migrations)

**Background:**
Go standard project layout separates executable entry points (cmd/), private application code (internal/), and public packages (pkg/). The Makefile provides build automation following Unix conventions.

### Step 1: Initialize Go module and create directories

**Command:**

```bash
cd /Users/yaroslavk/stagely
go mod init github.com/stagely-dev/stagely
mkdir -p cmd/core internal/config internal/db internal/models internal/crypto pkg/nanoid migrations
```

**Expected output:**

```
go: creating new go.mod: module github.com/stagely-dev/stagely
```

### Step 2: Create Makefile

**File:** `/Users/yaroslavk/stagely/Makefile`

```makefile
.PHONY: help
help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: build
build: ## Build Core API binary
	@echo "Building stagely-core..."
	@go build -o bin/stagely-core ./cmd/core

.PHONY: test
test: ## Run all tests
	@echo "Running tests..."
	@go test -v -race -coverprofile=coverage.out ./...

.PHONY: test-unit
test-unit: ## Run unit tests only
	@echo "Running unit tests..."
	@go test -v -short -race ./...

.PHONY: test-integration
test-integration: ## Run integration tests only
	@echo "Running integration tests..."
	@go test -v -run Integration ./...

.PHONY: lint
lint: ## Run linters
	@echo "Running linters..."
	@if command -v golangci-lint > /dev/null; then \
		golangci-lint run ./...; \
	else \
		echo "golangci-lint not installed. Install: https://golangci-lint.run/usage/install/"; \
	fi

.PHONY: migrate-up
migrate-up: ## Run database migrations
	@echo "Running migrations..."
	@migrate -path migrations -database "$(DATABASE_URL)" up

.PHONY: migrate-down
migrate-down: ## Rollback last migration
	@echo "Rolling back migration..."
	@migrate -path migrations -database "$(DATABASE_URL)" down 1

.PHONY: migrate-create
migrate-create: ## Create new migration file (usage: make migrate-create NAME=create_users)
	@if [ -z "$(NAME)" ]; then \
		echo "Error: NAME is required. Usage: make migrate-create NAME=create_users"; \
		exit 1; \
	fi
	@migrate create -ext sql -dir migrations -seq $(NAME)

.PHONY: docker-up
docker-up: ## Start Docker Compose services
	@echo "Starting Docker services..."
	@docker-compose up -d

.PHONY: docker-down
docker-down: ## Stop Docker Compose services
	@echo "Stopping Docker services..."
	@docker-compose down

.PHONY: clean
clean: ## Clean build artifacts
	@echo "Cleaning..."
	@rm -rf bin/ coverage.out

.PHONY: install-tools
install-tools: ## Install development tools
	@echo "Installing tools..."
	@go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	@echo "Tools installed successfully"

.DEFAULT_GOAL := help
```

### Step 3: Add initial Go dependencies

**Command:**

```bash
cd /Users/yaroslavk/stagely
go get -u gorm.io/gorm
go get -u gorm.io/driver/postgres
go get -u github.com/spf13/viper
go get -u github.com/google/uuid
go get -u github.com/matoous/go-nanoid/v2
go get -u github.com/stretchr/testify
go get -u github.com/testcontainers/testcontainers-go
go mod tidy
```

**Expected output:**

```
go: downloading gorm.io/gorm v1.25.x
go: downloading github.com/spf13/viper v1.18.x
...
```

### Step 4: Create Docker Compose file

**File:** `/Users/yaroslavk/stagely/docker-compose.yml`

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:14-alpine
    container_name: stagely-postgres
    environment:
      POSTGRES_USER: stagely
      POSTGRES_PASSWORD: stagely
      POSTGRES_DB: stagely
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U stagely"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: stagely-redis
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
```

### Step 5: Verify structure

**Command:**

```bash
cd /Users/yaroslavk/stagely
tree -L 3 -I 'node_modules|.git'
```

**Expected output:**

```
.
├── Makefile
├── cmd
│   └── core
├── docker-compose.yml
├── go.mod
├── go.sum
├── internal
│   ├── config
│   ├── crypto
│   ├── db
│   └── models
├── migrations
└── pkg
    └── nanoid
```

---

## Task 2: Configuration Module

**Objective:** Implement type-safe configuration loading from environment variables using Viper

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/config/config.go`
- Create: `/Users/yaroslavk/stagely/internal/config/config_test.go`

**Background:**
Viper provides a unified interface for loading configuration from multiple sources. We'll use environment variables following 12-factor app methodology.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/config/config_test.go`

```go
package config_test

import (
	"os"
	"testing"

	"github.com/stagely-dev/stagely/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_Success(t *testing.T) {
	// Given
	os.Setenv("DATABASE_URL", "postgres://localhost/test")
	os.Setenv("REDIS_URL", "redis://localhost:6379")
	os.Setenv("PORT", "8080")
	os.Setenv("ENVIRONMENT", "test")
	os.Setenv("LOG_LEVEL", "debug")
	defer os.Clearenv()

	// When
	cfg, err := config.Load()

	// Then
	require.NoError(t, err)
	assert.NotNil(t, cfg)
	assert.Equal(t, "postgres://localhost/test", cfg.Database.URL)
	assert.Equal(t, "redis://localhost:6379", cfg.Redis.URL)
	assert.Equal(t, 8080, cfg.Server.Port)
	assert.Equal(t, "test", cfg.Server.Environment)
	assert.Equal(t, "debug", cfg.Server.LogLevel)
}

func TestLoad_MissingDatabaseURL(t *testing.T) {
	// Given
	os.Clearenv()
	os.Setenv("REDIS_URL", "redis://localhost:6379")

	// When
	cfg, err := config.Load()

	// Then
	assert.Error(t, err)
	assert.Nil(t, cfg)
	assert.Contains(t, err.Error(), "DATABASE_URL")
}

func TestLoad_DefaultValues(t *testing.T) {
	// Given
	os.Clearenv()
	os.Setenv("DATABASE_URL", "postgres://localhost/test")
	os.Setenv("REDIS_URL", "redis://localhost:6379")

	// When
	cfg, err := config.Load()

	// Then
	require.NoError(t, err)
	assert.Equal(t, 8080, cfg.Server.Port)           // default
	assert.Equal(t, "development", cfg.Server.Environment) // default
	assert.Equal(t, "info", cfg.Server.LogLevel)     // default
}
```

**Why this test:** Verifies configuration loads correctly from environment variables, validates required fields, and uses defaults appropriately.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/config -v
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/config_test
internal/config/config_test.go:8:2: no required module provides package github.com/stagely-dev/stagely/internal/config; to add it:
	go get github.com/stagely-dev/stagely/internal/config
FAIL	github.com/stagely-dev/stagely/internal/config [setup failed]
```

**Why verify failure:** Ensures we're actually testing the code (no false positives).

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/config/config.go`

```go
package config

import (
	"fmt"

	"github.com/spf13/viper"
)

// Config holds all configuration for the application
type Config struct {
	Database DatabaseConfig
	Redis    RedisConfig
	Server   ServerConfig
	Security SecurityConfig
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	URL string
}

// RedisConfig holds Redis connection settings
type RedisConfig struct {
	URL string
}

// ServerConfig holds HTTP server settings
type ServerConfig struct {
	Port        int
	Environment string
	LogLevel    string
}

// SecurityConfig holds security-related settings
type SecurityConfig struct {
	JWTSecret     string
	EncryptionKey string
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	v := viper.New()

	// Set defaults
	v.SetDefault("PORT", 8080)
	v.SetDefault("ENVIRONMENT", "development")
	v.SetDefault("LOG_LEVEL", "info")

	// Bind environment variables
	v.AutomaticEnv()

	// Create config struct
	cfg := &Config{
		Database: DatabaseConfig{
			URL: v.GetString("DATABASE_URL"),
		},
		Redis: RedisConfig{
			URL: v.GetString("REDIS_URL"),
		},
		Server: ServerConfig{
			Port:        v.GetInt("PORT"),
			Environment: v.GetString("ENVIRONMENT"),
			LogLevel:    v.GetString("LOG_LEVEL"),
		},
		Security: SecurityConfig{
			JWTSecret:     v.GetString("JWT_SECRET"),
			EncryptionKey: v.GetString("ENCRYPTION_KEY"),
		},
	}

	// Validate required fields
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

// Validate checks that required configuration values are present
func (c *Config) Validate() error {
	if c.Database.URL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if c.Redis.URL == "" {
		return fmt.Errorf("REDIS_URL is required")
	}
	return nil
}
```

**Implementation notes:**

- Viper handles environment variable loading automatically
- Sensible defaults for development (port 8080, log level info)
- Validation ensures required fields are present
- Security fields (JWT, encryption key) optional in Phase 0, required in Phase 2

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/config -v
```

**Expected output:**

```
=== RUN   TestLoad_Success
--- PASS: TestLoad_Success (0.00s)
=== RUN   TestLoad_MissingDatabaseURL
--- PASS: TestLoad_MissingDatabaseURL (0.00s)
=== RUN   TestLoad_DefaultValues
--- PASS: TestLoad_DefaultValues (0.00s)
PASS
ok  	github.com/stagely-dev/stagely/internal/config	0.012s
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely
make test
```

**Expected:** All tests pass (only config tests at this point)

### Step 6: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add Makefile docker-compose.yml go.mod go.sum internal/config/
git commit -m "feat: add configuration module with Viper

- Implements type-safe config loading from environment variables
- Adds validation for required fields (DATABASE_URL, REDIS_URL)
- Sets sensible defaults for development (port 8080, log level info)
- Tests cover success case, missing fields, and default values"
```

---

## Task 3: NanoID Utility

**Objective:** Implement subdomain hash generation using NanoID algorithm

**Files:**

- Create: `/Users/yaroslavk/stagely/pkg/nanoid/nanoid.go`
- Create: `/Users/yaroslavk/stagely/pkg/nanoid/nanoid_test.go`

**Background:**
NanoID generates short, URL-safe unique identifiers for subdomain hashes (e.g., `pr-123-a8f9d2k1p4m7.stagely.dev`). Uses crypto/rand for security.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/pkg/nanoid/nanoid_test.go`

```go
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
```

**Why this test:** Validates ID format, length, character set, and uniqueness (collision resistance).

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./pkg/nanoid -v
```

**Expected output:**

```
# github.com/stagely-dev/stagely/pkg/nanoid_test
pkg/nanoid/nanoid_test.go:8:2: no required module provides package github.com/stagely-dev/stagely/pkg/nanoid
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/pkg/nanoid/nanoid.go`

```go
// Package nanoid provides URL-safe unique identifier generation
package nanoid

import (
	gonanoid "github.com/matoous/go-nanoid/v2"
)

const (
	// DefaultLength is the default length for generated IDs
	DefaultLength = 12

	// Alphabet defines the character set for IDs
	// Using only lowercase alphanumeric for URL safety and simplicity
	Alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
)

// Generate creates a new NanoID with the default length (12 characters)
// Uses crypto/rand for cryptographically secure random generation
func Generate() string {
	id, err := gonanoid.Generate(Alphabet, DefaultLength)
	if err != nil {
		// In practice, this should never happen with valid alphabet
		// But we handle it defensively
		panic("nanoid generation failed: " + err.Error())
	}
	return id
}

// GenerateWithLength creates a new NanoID with the specified length
// Returns empty string if length is 0
func GenerateWithLength(length int) string {
	if length == 0 {
		return ""
	}

	id, err := gonanoid.Generate(Alphabet, length)
	if err != nil {
		panic("nanoid generation failed: " + err.Error())
	}
	return id
}
```

**Implementation notes:**

- Uses proven go-nanoid library for implementation
- Custom alphabet (lowercase alphanumeric only) for simplicity
- Panics on error (should never happen with valid alphabet)
- Collision probability: ~1 in 10^21 for 1 million IDs (acceptable for subdomain hashes)

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./pkg/nanoid -v
```

**Expected output:**

```
=== RUN   TestGenerate
--- PASS: TestGenerate (0.00s)
=== RUN   TestGenerate_Uniqueness
--- PASS: TestGenerate_Uniqueness (0.01s)
=== RUN   TestGenerateWithLength
--- PASS: TestGenerateWithLength (0.00s)
=== RUN   TestGenerateWithLength_Zero
--- PASS: TestGenerateWithLength_Zero (0.00s)
PASS
ok  	github.com/stagely-dev/stagely/pkg/nanoid	0.015s
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely
make test
```

**Expected:** All tests pass (config + nanoid)

### Step 6: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add pkg/nanoid/
git commit -m "feat: add NanoID generator for subdomain hashes

- Implements Generate() for 12-character IDs
- Implements GenerateWithLength() for custom lengths
- Uses lowercase alphanumeric alphabet for URL safety
- Tests verify format, length, and uniqueness (1000 iterations)"
```

---

## Task 4: Encryption Module

**Objective:** Implement AES-256-GCM encryption for secrets

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/crypto/encrypt.go`
- Create: `/Users/yaroslavk/stagely/internal/crypto/encrypt_test.go`

**Background:**
AES-256-GCM provides both encryption (confidentiality) and authentication (integrity). AEAD mode detects tampering.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/crypto/encrypt_test.go`

```go
package crypto_test

import (
	"testing"

	"github.com/stagely-dev/stagely/internal/crypto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	// Given
	key, err := crypto.GenerateKey()
	require.NoError(t, err)
	plaintext := "my-secret-database-password"

	// When
	ciphertext, err := crypto.Encrypt(plaintext, key)
	require.NoError(t, err)

	decrypted, err := crypto.Decrypt(ciphertext, key)
	require.NoError(t, err)

	// Then
	assert.Equal(t, plaintext, decrypted)
	assert.NotEqual(t, plaintext, ciphertext, "Ciphertext should not equal plaintext")
}

func TestEncrypt_DifferentCiphertexts(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()
	plaintext := "same-plaintext"

	// When - Encrypt twice
	ciphertext1, _ := crypto.Encrypt(plaintext, key)
	ciphertext2, _ := crypto.Encrypt(plaintext, key)

	// Then - Should be different due to random nonce
	assert.NotEqual(t, ciphertext1, ciphertext2, "Each encryption should use a unique nonce")
}

func TestDecrypt_WrongKey(t *testing.T) {
	// Given
	key1, _ := crypto.GenerateKey()
	key2, _ := crypto.GenerateKey()
	plaintext := "secret-data"

	ciphertext, err := crypto.Encrypt(plaintext, key1)
	require.NoError(t, err)

	// When - Decrypt with wrong key
	_, err = crypto.Decrypt(ciphertext, key2)

	// Then
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "authentication failed")
}

func TestDecrypt_TamperedData(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()
	plaintext := "important-data"

	ciphertext, err := crypto.Encrypt(plaintext, key)
	require.NoError(t, err)

	// When - Tamper with ciphertext (flip a bit)
	tamperedBytes := []byte(ciphertext)
	if len(tamperedBytes) > 10 {
		tamperedBytes[10] ^= 0xFF // Flip bits
	}
	tampered := string(tamperedBytes)

	_, err = crypto.Decrypt(tampered, key)

	// Then
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "authentication failed")
}

func TestEncrypt_EmptyString(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()

	// When
	ciphertext, err := crypto.Encrypt("", key)
	require.NoError(t, err)

	decrypted, err := crypto.Decrypt(ciphertext, key)
	require.NoError(t, err)

	// Then
	assert.Equal(t, "", decrypted)
}

func TestEncrypt_LongText(t *testing.T) {
	// Given
	key, _ := crypto.GenerateKey()
	// Create 1KB of text
	plaintext := string(make([]byte, 1024))
	for i := range plaintext {
		plaintext = plaintext[:i] + "a"
	}

	// When
	ciphertext, err := crypto.Encrypt(plaintext, key)
	require.NoError(t, err)

	decrypted, err := crypto.Decrypt(ciphertext, key)
	require.NoError(t, err)

	// Then
	assert.Len(t, decrypted, len(plaintext))
}

func TestGenerateKey(t *testing.T) {
	// When
	key1, err1 := crypto.GenerateKey()
	key2, err2 := crypto.GenerateKey()

	// Then
	require.NoError(t, err1)
	require.NoError(t, err2)
	assert.Len(t, key1, 32, "Key should be 32 bytes (256 bits)")
	assert.Len(t, key2, 32)
	assert.NotEqual(t, key1, key2, "Keys should be unique")
}
```

**Why this test:** Verifies encryption correctness, tamper detection, wrong key rejection, edge cases (empty, long text).

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/crypto -v
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/crypto_test
internal/crypto/encrypt_test.go:8:2: no required module provides package github.com/stagely-dev/stagely/internal/crypto
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/crypto/encrypt.go`

```go
// Package crypto provides encryption utilities using AES-256-GCM
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

// Encrypt encrypts plaintext using AES-256-GCM with the provided key
// Returns base64-encoded ciphertext (format: nonce+ciphertext+tag)
func Encrypt(plaintext string, key []byte) (string, error) {
	if len(key) != 32 {
		return "", errors.New("encryption key must be 32 bytes")
	}

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Generate random nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// Encrypt (nonce is prepended automatically by Seal)
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	// Encode to base64 for storage
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts base64-encoded ciphertext using AES-256-GCM with the provided key
// Returns plaintext or error if authentication fails (wrong key or tampered data)
func Decrypt(ciphertext string, key []byte) (string, error) {
	if len(key) != 32 {
		return "", errors.New("encryption key must be 32 bytes")
	}

	// Decode from base64
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return "", errors.New("invalid ciphertext encoding")
	}

	// Create AES cipher
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	// Create GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Extract nonce and ciphertext
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]

	// Decrypt and verify authentication tag
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", errors.New("decryption failed: authentication failed (wrong key or tampered data)")
	}

	return string(plaintext), nil
}

// GenerateKey generates a new 32-byte (256-bit) encryption key
// Uses crypto/rand for cryptographically secure random generation
func GenerateKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, err
	}
	return key, nil
}
```

**Implementation notes:**

- AES-256-GCM with 12-byte nonce (standard)
- Nonce prepended to ciphertext (common pattern)
- Base64 encoding for text storage (database TEXT column)
- GCM authentication tag ensures integrity

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/crypto -v
```

**Expected output:**

```
=== RUN   TestEncryptDecrypt_RoundTrip
--- PASS: TestEncryptDecrypt_RoundTrip (0.00s)
=== RUN   TestEncrypt_DifferentCiphertexts
--- PASS: TestEncrypt_DifferentCiphertexts (0.00s)
=== RUN   TestDecrypt_WrongKey
--- PASS: TestDecrypt_WrongKey (0.00s)
=== RUN   TestDecrypt_TamperedData
--- PASS: TestDecrypt_TamperedData (0.00s)
=== RUN   TestEncrypt_EmptyString
--- PASS: TestEncrypt_EmptyString (0.00s)
=== RUN   TestEncrypt_LongText
--- PASS: TestEncrypt_LongText (0.00s)
=== RUN   TestGenerateKey
--- PASS: TestGenerateKey (0.00s)
PASS
ok  	github.com/stagely-dev/stagely/internal/crypto	0.018s
```

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely
make test
```

**Expected:** All tests pass (config + nanoid + crypto)

### Step 6: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add internal/crypto/
git commit -m "feat: add AES-256-GCM encryption module

- Implements Encrypt() and Decrypt() functions
- Uses GCM mode for authenticated encryption (AEAD)
- Generates random nonce per encryption (semantic security)
- Base64 encoding for database storage
- Tests verify round-trip, tamper detection, wrong key rejection"
```

---

## Task 5: Database Connection Module

**Objective:** Implement PostgreSQL connection factory with health check

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/db/db.go`
- Create: `/Users/yaroslavk/stagely/internal/db/db_test.go`

**Background:**
GORM provides ORM functionality on top of database/sql. We configure connection pooling for production use.

### Step 1: Write the failing test

**File:** `/Users/yaroslavk/stagely/internal/db/db_test.go`

```go
package db_test

import (
	"context"
	"testing"
	"time"

	"github.com/stagely-dev/stagely/internal/config"
	"github.com/stagely-dev/stagely/internal/db"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestConnect_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// Given - Start PostgreSQL container
	ctx := context.Background()
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:14-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "test",
				"POSTGRES_PASSWORD": "test",
				"POSTGRES_DB":       "test",
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	require.NoError(t, err)
	defer container.Terminate(ctx)

	// Get connection string
	host, err := container.Host(ctx)
	require.NoError(t, err)
	port, err := container.MappedPort(ctx, "5432")
	require.NoError(t, err)

	cfg := config.DatabaseConfig{
		URL: "postgres://test:test@" + host + ":" + port.Port() + "/test?sslmode=disable",
	}

	// When
	gormDB, err := db.Connect(cfg)

	// Then
	require.NoError(t, err)
	assert.NotNil(t, gormDB)

	// Verify connection works
	sqlDB, err := gormDB.DB()
	require.NoError(t, err)
	err = sqlDB.Ping()
	assert.NoError(t, err)
}

func TestHealthCheck_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// Given - Start PostgreSQL container
	ctx := context.Background()
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:14-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "test",
				"POSTGRES_PASSWORD": "test",
				"POSTGRES_DB":       "test",
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	require.NoError(t, err)
	defer container.Terminate(ctx)

	host, err := container.Host(ctx)
	require.NoError(t, err)
	port, err := container.MappedPort(ctx, "5432")
	require.NoError(t, err)

	cfg := config.DatabaseConfig{
		URL: "postgres://test:test@" + host + ":" + port.Port() + "/test?sslmode=disable",
	}

	gormDB, err := db.Connect(cfg)
	require.NoError(t, err)

	// When
	err = db.HealthCheck(gormDB)

	// Then
	assert.NoError(t, err)
}

func TestConnect_InvalidURL(t *testing.T) {
	// Given
	cfg := config.DatabaseConfig{
		URL: "invalid-url",
	}

	// When
	gormDB, err := db.Connect(cfg)

	// Then
	assert.Error(t, err)
	assert.Nil(t, gormDB)
}
```

**Why this test:** Verifies real PostgreSQL connection via testcontainers, health check, and error handling.

### Step 2: Run test to verify it fails

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/db -v
```

**Expected output:**

```
# github.com/stagely-dev/stagely/internal/db_test
internal/db/db_test.go:10:2: no required module provides package github.com/stagely-dev/stagely/internal/db
```

### Step 3: Write minimal implementation

**File:** `/Users/yaroslavk/stagely/internal/db/db.go`

```go
// Package db provides database connection management
package db

import (
	"time"

	"github.com/stagely-dev/stagely/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect establishes a connection to PostgreSQL using GORM
// Configures connection pooling for production use
func Connect(cfg config.DatabaseConfig) (*gorm.DB, error) {
	// Configure GORM
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	}

	// Open connection
	db, err := gorm.Open(postgres.Open(cfg.URL), gormConfig)
	if err != nil {
		return nil, err
	}

	// Get underlying sql.DB for connection pool configuration
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	// Configure connection pool
	sqlDB.SetMaxOpenConns(25)                 // Maximum open connections
	sqlDB.SetMaxIdleConns(5)                  // Maximum idle connections
	sqlDB.SetConnMaxLifetime(5 * time.Minute) // Connection lifetime
	sqlDB.SetConnMaxIdleTime(10 * time.Minute) // Idle connection timeout

	// Verify connection
	if err := sqlDB.Ping(); err != nil {
		return nil, err
	}

	return db, nil
}

// HealthCheck verifies the database connection is alive
func HealthCheck(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}
```

**Implementation notes:**

- Connection pool configured for moderate load (25 max connections)
- UTC timestamps by default (production best practice)
- GORM logger set to Info level for visibility
- Ping on connect to fail fast

### Step 4: Run test to verify it passes

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/db -v -run Integration
```

**Expected output:**

```
=== RUN   TestConnect_Integration
--- PASS: TestConnect_Integration (5.23s)
=== RUN   TestHealthCheck_Integration
--- PASS: TestHealthCheck_Integration (3.45s)
PASS
ok  	github.com/stagely-dev/stagely/internal/db	8.701s
```

_Note: Integration tests may take 5-10 seconds due to container startup_

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely
make test
```

**Expected:** All tests pass (config + nanoid + crypto + db)

### Step 6: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add internal/db/
git commit -m "feat: add database connection module with GORM

- Implements Connect() with connection pooling configuration
- Implements HealthCheck() for readiness probes
- Configures pool (25 max connections, 5 idle)
- Integration tests use testcontainers for real PostgreSQL"
```

---

## Task 6: Database Migrations (Part 1: Core Tables)

**Objective:** Create SQL migrations for teams, users, team_members, projects, and cloud_providers

**Files:**

- Create: `/Users/yaroslavk/stagely/migrations/001_create_teams.sql`
- Create: `/Users/yaroslavk/stagely/migrations/002_create_users.sql`
- Create: `/Users/yaroslavk/stagely/migrations/003_create_team_members.sql`
- Create: `/Users/yaroslavk/stagely/migrations/004_create_projects.sql`
- Create: `/Users/yaroslavk/stagely/migrations/005_create_cloud_providers.sql`

**Background:**
These are the foundational tables for multi-tenancy (teams), users, and project configuration.

### Step 1: Create teams migration

**File:** `/Users/yaroslavk/stagely/migrations/001_create_teams.sql`

```sql
-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,

    -- Billing
    billing_email VARCHAR(255),
    billing_plan VARCHAR(50) DEFAULT 'free',

    -- Limits
    max_concurrent_stagelets INT DEFAULT 5,
    max_concurrent_builds INT DEFAULT 10,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT valid_plan CHECK (billing_plan IN ('free', 'pro', 'enterprise'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);
CREATE INDEX IF NOT EXISTS idx_teams_deleted ON teams(deleted_at) WHERE deleted_at IS NULL;

-- Comments
COMMENT ON TABLE teams IS 'Top-level tenant. Users belong to teams.';
COMMENT ON COLUMN teams.slug IS 'URL-safe identifier (e.g., "acme-corp")';
COMMENT ON COLUMN teams.max_concurrent_stagelets IS 'Quota: max active preview environments';
```

### Step 2: Create users migration

**File:** `/Users/yaroslavk/stagely/migrations/002_create_users.sql`

```sql
-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,

    -- OAuth
    github_id VARCHAR(100) UNIQUE,
    google_id VARCHAR(100) UNIQUE,

    -- Status
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,

    CONSTRAINT valid_email CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_github ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);

-- Comments
COMMENT ON TABLE users IS 'User accounts (authentication via OAuth)';
```

### Step 3: Create team_members migration

**File:** `/Users/yaroslavk/stagely/migrations/003_create_team_members.sql`

```sql
-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_team_user UNIQUE(team_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);

-- Comments
COMMENT ON TABLE team_members IS 'User membership in teams with role-based access control';
COMMENT ON COLUMN team_members.role IS 'owner=full control, admin=manage, member=create, viewer=read-only';
```

### Step 4: Create projects migration

**File:** `/Users/yaroslavk/stagely/migrations/004_create_projects.sql`

```sql
-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,

    -- Git
    repo_url TEXT NOT NULL,
    repo_provider VARCHAR(50) NOT NULL DEFAULT 'github',
    default_branch VARCHAR(100) DEFAULT 'main',

    -- Cloud
    cloud_provider_id UUID,
    default_preview_size VARCHAR(20) DEFAULT 'medium',

    -- Configuration
    config JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_project_slug UNIQUE(team_id, slug),
    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT valid_provider CHECK (repo_provider IN ('github', 'gitlab', 'bitbucket')),
    CONSTRAINT valid_size CHECK (default_preview_size IN ('small', 'medium', 'large', 'xlarge'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(team_id, slug);
CREATE INDEX IF NOT EXISTS idx_projects_repo ON projects(repo_url);

-- Comments
COMMENT ON TABLE projects IS 'Git repositories configured for preview environments';
COMMENT ON COLUMN projects.config IS 'Project-specific settings (JSON)';
```

### Step 5: Create cloud_providers migration

**File:** `/Users/yaroslavk/stagely/migrations/005_create_cloud_providers.sql`

```sql
-- Create cloud_providers table
CREATE TABLE IF NOT EXISTS cloud_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    provider_type VARCHAR(50) NOT NULL,

    -- Encrypted credentials
    encrypted_credentials TEXT NOT NULL,

    -- Configuration
    region VARCHAR(50),
    config JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_validated_at TIMESTAMPTZ,
    validation_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_provider_name UNIQUE(team_id, name),
    CONSTRAINT valid_provider CHECK (provider_type IN ('aws', 'gcp', 'digitalocean', 'hetzner', 'linode'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cloud_providers_team ON cloud_providers(team_id);

-- Comments
COMMENT ON TABLE cloud_providers IS 'User-managed cloud provider credentials (BYO Cloud model)';
COMMENT ON COLUMN cloud_providers.encrypted_credentials IS 'AES-256-GCM encrypted JSON of API keys/tokens';

-- Add foreign key to projects (now that cloud_providers exists)
ALTER TABLE projects
ADD CONSTRAINT fk_projects_cloud_provider
FOREIGN KEY (cloud_provider_id)
REFERENCES cloud_providers(id)
ON DELETE SET NULL;
```

### Step 6: Test migrations

**Command:**

```bash
# Start PostgreSQL
cd /Users/yaroslavk/stagely
make docker-up

# Wait for PostgreSQL to be ready (check with docker-compose logs)
sleep 5

# Set DATABASE_URL
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"

# Run migrations
make migrate-up
```

**Expected output:**

```
Running migrations...
migrate -path migrations -database "postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable" up
1/5 001_create_teams.sql
2/5 002_create_users.sql
3/5 003_create_team_members.sql
4/5 004_create_projects.sql
5/5 005_create_cloud_providers.sql
```

### Step 7: Verify tables created

**Command:**

```bash
docker exec -it stagely-postgres psql -U stagely -d stagely -c "\dt"
```

**Expected output:**

```
                List of relations
 Schema |      Name       | Type  |  Owner
--------+-----------------+-------+---------
 public | cloud_providers | table | stagely
 public | projects        | table | stagely
 public | team_members    | table | stagely
 public | teams           | table | stagely
 public | users           | table | stagely
```

### Step 8: Test rollback

**Command:**

```bash
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"
make migrate-down
```

**Expected output:**

```
Rolling back migration...
migrate -path migrations -database "..." down 1
Are you sure you want to apply migration 5/d? [y/N]
Applying migration 5/d (005_create_cloud_providers.sql)
```

_Note: golang-migrate asks for confirmation by default_

### Step 9: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add migrations/001_create_teams.sql migrations/002_create_users.sql migrations/003_create_team_members.sql migrations/004_create_projects.sql migrations/005_create_cloud_providers.sql
git commit -m "feat: add database migrations for core tables

- Adds teams table with billing and quotas
- Adds users table with OAuth fields
- Adds team_members for many-to-many relationship
- Adds projects table for Git repository configuration
- Adds cloud_providers table for encrypted credentials
- All tables include indexes and constraints"
```

---

## Task 7: Database Migrations (Part 2: Environment and Workflow Tables)

**Objective:** Create SQL migrations for environments, workflow_runs, build_jobs, build_logs

**Files:**

- Create: `/Users/yaroslavk/stagely/migrations/006_create_environments.sql`
- Create: `/Users/yaroslavk/stagely/migrations/007_create_workflow_runs.sql`
- Create: `/Users/yaroslavk/stagely/migrations/008_create_build_jobs.sql`
- Create: `/Users/yaroslavk/stagely/migrations/009_create_build_logs.sql`

**Background:**
These tables track the lifecycle of preview environments and build pipelines.

### Step 1: Create environments migration

**File:** `/Users/yaroslavk/stagely/migrations/006_create_environments.sql`

```sql
-- Create environments table (formerly "stagelets")
CREATE TABLE IF NOT EXISTS environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- GitHub/Git Context
    pr_number INT,
    branch_name VARCHAR(255) NOT NULL,
    commit_hash VARCHAR(40) NOT NULL,

    -- Routing
    subdomain_hash VARCHAR(50) NOT NULL UNIQUE,

    -- Infrastructure
    vm_id VARCHAR(255),
    vm_ip INET,
    vm_status VARCHAR(20) DEFAULT 'pending',

    -- Lifecycle
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    deployed_at TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ,

    -- Cost tracking
    estimated_cost_usd DECIMAL(10, 4) DEFAULT 0.0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_vm_status CHECK (vm_status IN ('pending', 'provisioning', 'running', 'stopped', 'terminated')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'building', 'deploying', 'ready', 'failed', 'terminated', 'reaped'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_environments_project ON environments(project_id);
CREATE INDEX IF NOT EXISTS idx_environments_pr ON environments(project_id, pr_number);
CREATE INDEX IF NOT EXISTS idx_environments_hash ON environments(subdomain_hash);
CREATE INDEX IF NOT EXISTS idx_environments_status ON environments(status);
CREATE INDEX IF NOT EXISTS idx_environments_heartbeat ON environments(last_heartbeat_at) WHERE status = 'ready';

-- Comments
COMMENT ON TABLE environments IS 'Ephemeral preview environments (one per PR)';
COMMENT ON COLUMN environments.subdomain_hash IS 'NanoID for URL: https://{hash}.stagely.dev';
COMMENT ON COLUMN environments.last_heartbeat_at IS 'Agent heartbeat timestamp (used by Reaper)';
```

### Step 2: Create workflow_runs migration

**File:** `/Users/yaroslavk/stagely/migrations/007_create_workflow_runs.sql`

```sql
-- Create workflow_runs table
CREATE TABLE IF NOT EXISTS workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,

    -- Trigger
    trigger VARCHAR(50) NOT NULL,
    triggered_by UUID REFERENCES users(id),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INT,

    -- Result
    result VARCHAR(20),
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_trigger CHECK (trigger IN ('pr_opened', 'pr_synchronized', 'manual_rebuild', 'secret_updated')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'building', 'deploying', 'testing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT valid_result CHECK (result IN ('success', 'failure', 'cancelled') OR result IS NULL)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workflow_runs_env ON workflow_runs(environment_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at DESC);

-- Comments
COMMENT ON TABLE workflow_runs IS 'Build/deploy/test pipeline execution tracking';
```

### Step 3: Create build_jobs migration

**File:** `/Users/yaroslavk/stagely/migrations/008_create_build_jobs.sql`

```sql
-- Create build_jobs table
CREATE TABLE IF NOT EXISTS build_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,

    -- Build config
    name VARCHAR(100) NOT NULL,
    architecture VARCHAR(20) NOT NULL,
    context_path VARCHAR(500),
    dockerfile_path VARCHAR(500),

    -- Infrastructure
    vm_id VARCHAR(255),
    cloud_provider_id UUID REFERENCES cloud_providers(id),
    machine_size VARCHAR(20),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'queued',

    -- Timing
    queued_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_seconds INT,

    -- Result
    artifact_url TEXT,
    exit_code INT,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_architecture CHECK (architecture IN ('amd64', 'arm64', 'multi')),
    CONSTRAINT valid_status CHECK (status IN ('queued', 'provisioning', 'running', 'completed', 'failed', 'cancelled'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_build_jobs_workflow ON build_jobs(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_build_jobs_status ON build_jobs(status);
CREATE INDEX IF NOT EXISTS idx_build_jobs_queued ON build_jobs(queued_at) WHERE status = 'queued';

-- Comments
COMMENT ON TABLE build_jobs IS 'Individual build tasks (one per build target per architecture)';
COMMENT ON COLUMN build_jobs.artifact_url IS 'Docker registry URL: registry.internal/proj/env:tag';
```

### Step 4: Create build_logs migration

**File:** `/Users/yaroslavk/stagely/migrations/009_create_build_logs.sql`

```sql
-- Create build_logs table
CREATE TABLE IF NOT EXISTS build_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_job_id UUID NOT NULL REFERENCES build_jobs(id) ON DELETE CASCADE,

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stream VARCHAR(10) NOT NULL,
    line TEXT NOT NULL,

    CONSTRAINT valid_stream CHECK (stream IN ('stdout', 'stderr'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_build_logs_job ON build_logs(build_job_id, timestamp);

-- Comments
COMMENT ON TABLE build_logs IS 'Real-time build output (streamed via Agent WebSocket)';
```

### Step 5: Run migrations

**Command:**

```bash
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"
make migrate-up
```

**Expected output:**

```
6/9 006_create_environments.sql
7/9 007_create_workflow_runs.sql
8/9 008_create_build_jobs.sql
9/9 009_create_build_logs.sql
```

### Step 6: Verify tables

**Command:**

```bash
docker exec -it stagely-postgres psql -U stagely -d stagely -c "\d environments"
```

**Expected output:**

```
                Table "public.environments"
     Column      |           Type           | Nullable
-----------------+--------------------------+----------
 id              | uuid                     | not null
 project_id      | uuid                     | not null
 pr_number       | integer                  |
 subdomain_hash  | character varying(50)    | not null
 ...
```

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add migrations/006_create_environments.sql migrations/007_create_workflow_runs.sql migrations/008_create_build_jobs.sql migrations/009_create_build_logs.sql
git commit -m "feat: add migrations for environments and build pipeline

- Adds environments table for preview environments
- Adds workflow_runs for pipeline tracking
- Adds build_jobs for individual Docker builds
- Adds build_logs for streaming build output
- Includes indexes for performance-critical queries"
```

---

## Task 8: Database Migrations (Part 3: Secrets and Audit)

**Objective:** Create SQL migrations for secrets, audit_logs, agent_connections, indexes, and functions

**Files:**

- Create: `/Users/yaroslavk/stagely/migrations/010_create_secrets.sql`
- Create: `/Users/yaroslavk/stagely/migrations/011_create_audit_logs.sql`
- Create: `/Users/yaroslavk/stagely/migrations/012_create_agent_connections.sql`
- Create: `/Users/yaroslavk/stagely/migrations/013_create_indexes.sql`
- Create: `/Users/yaroslavk/stagely/migrations/014_create_functions.sql`

**Background:**
Final tables for secrets management, audit trail, and agent tracking. Plus additional indexes and trigger functions.

### Step 1: Create secrets migration

**File:** `/Users/yaroslavk/stagely/migrations/010_create_secrets.sql`

```sql
-- Create secrets table
CREATE TABLE IF NOT EXISTS secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Secret identity
    key VARCHAR(255) NOT NULL,
    encrypted_value TEXT NOT NULL,

    -- Scoping
    scope VARCHAR(50) NOT NULL DEFAULT 'global',

    -- Type
    secret_type VARCHAR(20) NOT NULL DEFAULT 'env',
    file_path TEXT,
    file_permissions VARCHAR(4),

    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_secret_per_scope UNIQUE(project_id, key, scope),
    CONSTRAINT valid_scope CHECK (scope = 'global' OR scope ~ '^[a-zA-Z0-9_-]+$'),
    CONSTRAINT valid_type CHECK (secret_type IN ('env', 'file'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_secrets_project ON secrets(project_id);
CREATE INDEX IF NOT EXISTS idx_secrets_project_scope ON secrets(project_id, scope);

-- Comments
COMMENT ON TABLE secrets IS 'Encrypted secrets injected into environments';
COMMENT ON COLUMN secrets.scope IS '"global" or service name (e.g., "backend", "frontend")';
COMMENT ON COLUMN secrets.encrypted_value IS 'AES-256-GCM encrypted';
```

### Step 2: Create audit_logs migration

**File:** `/Users/yaroslavk/stagely/migrations/011_create_audit_logs.sql`

```sql
-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who
    actor_id UUID REFERENCES users(id),
    actor_email VARCHAR(255),
    actor_ip INET,

    -- What
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,

    -- Context
    team_id UUID REFERENCES teams(id),
    project_id UUID REFERENCES projects(id),

    -- Details
    metadata JSONB,

    -- When
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_resource_type CHECK (resource_type IN ('team', 'project', 'environment', 'secret', 'user', 'workflow_run'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_team ON audit_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- Comments
COMMENT ON TABLE audit_logs IS 'Audit trail for all sensitive operations';
```

### Step 3: Create agent_connections migration

**File:** `/Users/yaroslavk/stagely/migrations/012_create_agent_connections.sql`

```sql
-- Create agent_connections table
CREATE TABLE IF NOT EXISTS agent_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,

    agent_id VARCHAR(100) NOT NULL UNIQUE,
    token_hash VARCHAR(64) NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'connected',

    -- Metadata
    ip_address INET,
    agent_version VARCHAR(20),
    system_info JSONB,

    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('connected', 'disconnected'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_connections_env ON agent_connections(environment_id);
CREATE INDEX IF NOT EXISTS idx_agent_connections_last_seen ON agent_connections(last_seen_at) WHERE status = 'connected';

-- Comments
COMMENT ON TABLE agent_connections IS 'Active Agent WebSocket connections (in-memory state persisted)';
```

### Step 4: Create additional indexes migration

**File:** `/Users/yaroslavk/stagely/migrations/013_create_indexes.sql`

```sql
-- Additional composite indexes for performance-critical queries

-- Fast lookup: "Find active environments for this project"
CREATE INDEX IF NOT EXISTS idx_environments_project_status
ON environments(project_id, status)
WHERE status IN ('ready', 'deploying');

-- Fast lookup: "Find all build jobs waiting in queue"
CREATE INDEX IF NOT EXISTS idx_build_jobs_status_queued
ON build_jobs(status, queued_at)
WHERE status = 'queued';

-- Fast lookup: "Find environments by PR number (not terminated)"
CREATE INDEX IF NOT EXISTS idx_environments_pr_lookup
ON environments(project_id, pr_number)
WHERE terminated_at IS NULL;

-- Fast lookup: "Find team members for authorization checks"
CREATE INDEX IF NOT EXISTS idx_team_members_composite
ON team_members(user_id, team_id, role);

-- Fast lookup: "Find recent audit logs for a team"
CREATE INDEX IF NOT EXISTS idx_audit_logs_team_time
ON audit_logs(team_id, timestamp DESC);
```

### Step 5: Create functions migration

**File:** `/Users/yaroslavk/stagely/migrations/014_create_functions.sql`

```sql
-- Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at column
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cloud_providers_updated_at BEFORE UPDATE ON cloud_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_environments_updated_at BEFORE UPDATE ON environments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_runs_updated_at BEFORE UPDATE ON workflow_runs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_build_jobs_updated_at BEFORE UPDATE ON build_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_secrets_updated_at BEFORE UPDATE ON secrets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON FUNCTION update_updated_at_column() IS 'Automatically updates updated_at timestamp on row modification';
```

### Step 6: Run final migrations

**Command:**

```bash
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"
make migrate-up
```

**Expected output:**

```
10/14 010_create_secrets.sql
11/14 011_create_audit_logs.sql
12/14 012_create_agent_connections.sql
13/14 013_create_indexes.sql
14/14 014_create_functions.sql
```

### Step 7: Verify complete schema

**Command:**

```bash
docker exec -it stagely-postgres psql -U stagely -d stagely -c "\dt"
```

**Expected output:** 12 tables listed

### Step 8: Test trigger function

**Command:**

```bash
docker exec -it stagely-postgres psql -U stagely -d stagely << 'EOF'
INSERT INTO teams (slug, name) VALUES ('test-team', 'Test Team');
SELECT slug, created_at, updated_at FROM teams WHERE slug = 'test-team';
UPDATE teams SET name = 'Updated Team' WHERE slug = 'test-team';
SELECT slug, created_at, updated_at FROM teams WHERE slug = 'test-team';
EOF
```

**Expected:** `updated_at` timestamp changes after UPDATE

### Step 9: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add migrations/010_create_secrets.sql migrations/011_create_audit_logs.sql migrations/012_create_agent_connections.sql migrations/013_create_indexes.sql migrations/014_create_functions.sql
git commit -m "feat: complete database schema with secrets and audit

- Adds secrets table for encrypted environment variables
- Adds audit_logs for compliance tracking
- Adds agent_connections for WebSocket state
- Adds composite indexes for query performance
- Adds trigger function for auto-updating updated_at"
```

---

## Task 9: GORM Models (Part 1: Core Models)

**Objective:** Define GORM models for teams, users, team_members, projects, cloud_providers

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/models/base.go`
- Create: `/Users/yaroslavk/stagely/internal/models/team.go`
- Create: `/Users/yaroslavk/stagely/internal/models/user.go`
- Create: `/Users/yaroslavk/stagely/internal/models/team_member.go`
- Create: `/Users/yaroslavk/stagely/internal/models/project.go`
- Create: `/Users/yaroslavk/stagely/internal/models/cloud_provider.go`

**Background:**
GORM models provide ORM abstraction over database schema. Models must match migration schema exactly.

### Step 1: Create base model

**File:** `/Users/yaroslavk/stagely/internal/models/base.go`

```go
// Package models provides GORM database models
package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BaseModel contains common fields for all models
type BaseModel struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time      `gorm:"not null;default:now()" json:"created_at"`
	UpdatedAt time.Time      `gorm:"not null;default:now()" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// BeforeCreate sets UUID if not already set
func (b *BaseModel) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}
```

### Step 2: Create team model

**File:** `/Users/yaroslavk/stagely/internal/models/team.go`

```go
package models

// Team represents the top-level tenant
type Team struct {
	BaseModel

	Slug string `gorm:"type:varchar(100);not null;uniqueIndex" json:"slug"`
	Name string `gorm:"type:varchar(255);not null" json:"name"`

	// Billing
	BillingEmail *string `gorm:"type:varchar(255)" json:"billing_email,omitempty"`
	BillingPlan  string  `gorm:"type:varchar(50);default:'free'" json:"billing_plan"`

	// Limits
	MaxConcurrentStagelets int `gorm:"default:5" json:"max_concurrent_stagelets"`
	MaxConcurrentBuilds    int `gorm:"default:10" json:"max_concurrent_builds"`

	// Relationships
	Members  []TeamMember   `gorm:"foreignKey:TeamID" json:"members,omitempty"`
	Projects []Project      `gorm:"foreignKey:TeamID" json:"projects,omitempty"`
	Providers []CloudProvider `gorm:"foreignKey:TeamID" json:"providers,omitempty"`
}

// TableName returns the table name for GORM
func (Team) TableName() string {
	return "teams"
}
```

### Step 3: Create user model

**File:** `/Users/yaroslavk/stagely/internal/models/user.go`

```go
package models

import "time"

// User represents a user account
type User struct {
	BaseModel

	Email     string  `gorm:"type:varchar(255);not null;uniqueIndex" json:"email"`
	Name      string  `gorm:"type:varchar(255);not null" json:"name"`
	AvatarURL *string `gorm:"type:text" json:"avatar_url,omitempty"`

	// OAuth
	GithubID *string `gorm:"type:varchar(100);uniqueIndex" json:"github_id,omitempty"`
	GoogleID *string `gorm:"type:varchar(100);uniqueIndex" json:"google_id,omitempty"`

	// Status
	IsActive      bool  `gorm:"default:true" json:"is_active"`
	EmailVerified bool  `gorm:"default:false" json:"email_verified"`
	LastLoginAt   *time.Time `gorm:"type:timestamptz" json:"last_login_at,omitempty"`

	// Relationships
	TeamMemberships []TeamMember `gorm:"foreignKey:UserID" json:"team_memberships,omitempty"`
}

// TableName returns the table name for GORM
func (User) TableName() string {
	return "users"
}
```

### Step 4: Create team_member model

**File:** `/Users/yaroslavk/stagely/internal/models/team_member.go`

```go
package models

import "github.com/google/uuid"

// TeamMember represents user membership in a team
type TeamMember struct {
	BaseModel

	TeamID uuid.UUID `gorm:"type:uuid;not null;index:idx_team_members_team" json:"team_id"`
	UserID uuid.UUID `gorm:"type:uuid;not null;index:idx_team_members_user" json:"user_id"`
	Role   string    `gorm:"type:varchar(50);not null;default:'member'" json:"role"`

	// Relationships
	Team Team `gorm:"foreignKey:TeamID" json:"team,omitempty"`
	User User `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

// TableName returns the table name for GORM
func (TeamMember) TableName() string {
	return "team_members"
}
```

### Step 5: Create project model

**File:** `/Users/yaroslavk/stagely/internal/models/project.go`

```go
package models

import (
	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// Project represents a Git repository configuration
type Project struct {
	BaseModel

	TeamID uuid.UUID `gorm:"type:uuid;not null;index:idx_projects_team" json:"team_id"`
	Slug   string    `gorm:"type:varchar(100);not null" json:"slug"`
	Name   string    `gorm:"type:varchar(255);not null" json:"name"`

	// Git
	RepoURL       string  `gorm:"type:text;not null;index:idx_projects_repo" json:"repo_url"`
	RepoProvider  string  `gorm:"type:varchar(50);not null;default:'github'" json:"repo_provider"`
	DefaultBranch *string `gorm:"type:varchar(100);default:'main'" json:"default_branch,omitempty"`

	// Cloud
	CloudProviderID    *uuid.UUID `gorm:"type:uuid" json:"cloud_provider_id,omitempty"`
	DefaultPreviewSize string     `gorm:"type:varchar(20);default:'medium'" json:"default_preview_size"`

	// Configuration
	Config datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"config"`

	// Status
	IsActive bool `gorm:"default:true" json:"is_active"`

	// Relationships
	Team           Team           `gorm:"foreignKey:TeamID" json:"team,omitempty"`
	CloudProvider  *CloudProvider `gorm:"foreignKey:CloudProviderID" json:"cloud_provider,omitempty"`
	Environments   []Environment  `gorm:"foreignKey:ProjectID" json:"environments,omitempty"`
	Secrets        []Secret       `gorm:"foreignKey:ProjectID" json:"secrets,omitempty"`
}

// TableName returns the table name for GORM
func (Project) TableName() string {
	return "projects"
}
```

### Step 6: Create cloud_provider model

**File:** `/Users/yaroslavk/stagely/internal/models/cloud_provider.go`

```go
package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// CloudProvider represents user-managed cloud credentials
type CloudProvider struct {
	BaseModel

	TeamID       uuid.UUID `gorm:"type:uuid;not null;index:idx_cloud_providers_team" json:"team_id"`
	Name         string    `gorm:"type:varchar(100);not null" json:"name"`
	ProviderType string    `gorm:"type:varchar(50);not null" json:"provider_type"`

	// Encrypted credentials
	EncryptedCredentials string `gorm:"type:text;not null" json:"-"` // Hidden from JSON

	// Configuration
	Region *string        `gorm:"type:varchar(50)" json:"region,omitempty"`
	Config datatypes.JSON `gorm:"type:jsonb;default:'{}'" json:"config"`

	// Status
	IsActive        bool       `gorm:"default:true" json:"is_active"`
	LastValidatedAt *time.Time `gorm:"type:timestamptz" json:"last_validated_at,omitempty"`
	ValidationError *string    `gorm:"type:text" json:"validation_error,omitempty"`

	// Relationships
	Team     Team      `gorm:"foreignKey:TeamID" json:"team,omitempty"`
	Projects []Project `gorm:"foreignKey:CloudProviderID" json:"projects,omitempty"`
}

// TableName returns the table name for GORM
func (CloudProvider) TableName() string {
	return "cloud_providers"
}
```

### Step 7: Create integration test for models

**File:** `/Users/yaroslavk/stagely/internal/models/models_test.go`

```go
package models_test

import (
	"context"
	"testing"
	"time"

	"github.com/stagely-dev/stagely/internal/config"
	"github.com/stagely-dev/stagely/internal/db"
	"github.com/stagely-dev/stagely/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

func setupTestDB(t *testing.T) (*gorm.DB, func()) {
	ctx := context.Background()

	// Start PostgreSQL container
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:14-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_USER":     "test",
				"POSTGRES_PASSWORD": "test",
				"POSTGRES_DB":       "test",
			},
			WaitingFor: wait.ForLog("database system is ready to accept connections").
				WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	require.NoError(t, err)

	host, err := container.Host(ctx)
	require.NoError(t, err)
	port, err := container.MappedPort(ctx, "5432")
	require.NoError(t, err)

	cfg := config.DatabaseConfig{
		URL: "postgres://test:test@" + host + ":" + port.Port() + "/test?sslmode=disable",
	}

	gormDB, err := db.Connect(cfg)
	require.NoError(t, err)

	// Auto-migrate models
	err = gormDB.AutoMigrate(
		&models.Team{},
		&models.User{},
		&models.TeamMember{},
		&models.CloudProvider{},
		&models.Project{},
	)
	require.NoError(t, err)

	cleanup := func() {
		container.Terminate(ctx)
	}

	return gormDB, cleanup
}

func TestTeamCRUD_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// Given
	db, cleanup := setupTestDB(t)
	defer cleanup()

	// When - Create
	team := models.Team{
		Slug: "acme-corp",
		Name: "Acme Corporation",
	}
	result := db.Create(&team)

	// Then
	require.NoError(t, result.Error)
	assert.NotEqual(t, uuid.Nil, team.ID)
	assert.Equal(t, "acme-corp", team.Slug)

	// When - Read
	var foundTeam models.Team
	result = db.Where("slug = ?", "acme-corp").First(&foundTeam)

	// Then
	require.NoError(t, result.Error)
	assert.Equal(t, team.ID, foundTeam.ID)
	assert.Equal(t, "Acme Corporation", foundTeam.Name)

	// When - Update
	result = db.Model(&foundTeam).Update("name", "Updated Acme")

	// Then
	require.NoError(t, result.Error)
	var updatedTeam models.Team
	db.First(&updatedTeam, foundTeam.ID)
	assert.Equal(t, "Updated Acme", updatedTeam.Name)

	// When - Delete (soft delete)
	result = db.Delete(&updatedTeam)

	// Then
	require.NoError(t, result.Error)
	var deletedTeam models.Team
	result = db.First(&deletedTeam, updatedTeam.ID)
	assert.Error(t, result.Error) // Should not find soft-deleted record
}

func TestTeamUserRelationship_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// Given
	db, cleanup := setupTestDB(t)
	defer cleanup()

	team := models.Team{Slug: "test-team", Name: "Test Team"}
	db.Create(&team)

	user := models.User{Email: "test@example.com", Name: "Test User"}
	db.Create(&user)

	// When
	teamMember := models.TeamMember{
		TeamID: team.ID,
		UserID: user.ID,
		Role:   "admin",
	}
	result := db.Create(&teamMember)

	// Then
	require.NoError(t, result.Error)

	// Verify relationship
	var foundMember models.TeamMember
	db.Preload("Team").Preload("User").First(&foundMember, teamMember.ID)
	assert.Equal(t, "test-team", foundMember.Team.Slug)
	assert.Equal(t, "test@example.com", foundMember.User.Email)
}
```

### Step 8: Run integration tests

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/models -v -run Integration
```

**Expected output:**

```
=== RUN   TestTeamCRUD_Integration
--- PASS: TestTeamCRUD_Integration (6.45s)
=== RUN   TestTeamUserRelationship_Integration
--- PASS: TestTeamUserRelationship_Integration (5.23s)
PASS
ok  	github.com/stagely-dev/stagely/internal/models	11.702s
```

### Step 9: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely
make test
```

**Expected:** All tests pass

### Step 10: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add internal/models/base.go internal/models/team.go internal/models/user.go internal/models/team_member.go internal/models/project.go internal/models/cloud_provider.go internal/models/models_test.go
git commit -m "feat: add GORM models for core entities

- Adds BaseModel with common fields (ID, timestamps, soft delete)
- Adds Team, User, TeamMember, Project, CloudProvider models
- All models have proper GORM tags and relationships
- Integration tests verify CRUD and relationships"
```

---

## Task 10: GORM Models (Part 2: Environment and Workflow Models)

**Objective:** Define GORM models for environments, workflow_runs, build_jobs, build_logs, secrets, audit_logs, agent_connections

**Files:**

- Create: `/Users/yaroslavk/stagely/internal/models/environment.go`
- Create: `/Users/yaroslavk/stagely/internal/models/workflow_run.go`
- Create: `/Users/yaroslavk/stagely/internal/models/build_job.go`
- Create: `/Users/yaroslavk/stagely/internal/models/build_log.go`
- Create: `/Users/yaroslavk/stagely/internal/models/secret.go`
- Create: `/Users/yaroslavk/stagely/internal/models/audit_log.go`
- Create: `/Users/yaroslavk/stagely/internal/models/agent_connection.go`

**Background:**
Complete all remaining models to match database schema.

### Step 1-7: Create remaining models

**File:** `/Users/yaroslavk/stagely/internal/models/environment.go`

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// Environment represents an ephemeral preview environment
type Environment struct {
	BaseModel

	ProjectID uuid.UUID `gorm:"type:uuid;not null;index:idx_environments_project" json:"project_id"`

	// GitHub/Git Context
	PRNumber   *int   `gorm:"index:idx_environments_pr" json:"pr_number,omitempty"`
	BranchName string `gorm:"type:varchar(255);not null" json:"branch_name"`
	CommitHash string `gorm:"type:varchar(40);not null" json:"commit_hash"`

	// Routing
	SubdomainHash string `gorm:"type:varchar(50);not null;uniqueIndex:idx_environments_hash" json:"subdomain_hash"`

	// Infrastructure
	VMID     *string `gorm:"type:varchar(255)" json:"vm_id,omitempty"`
	VMIP     *string `gorm:"type:inet" json:"vm_ip,omitempty"`
	VMStatus string  `gorm:"type:varchar(20);default:'pending'" json:"vm_status"`

	// Lifecycle
	Status          string     `gorm:"type:varchar(20);not null;default:'pending';index:idx_environments_status" json:"status"`
	DeployedAt      *time.Time `gorm:"type:timestamptz" json:"deployed_at,omitempty"`
	LastHeartbeatAt *time.Time `gorm:"type:timestamptz;index:idx_environments_heartbeat" json:"last_heartbeat_at,omitempty"`
	TerminatedAt    *time.Time `gorm:"type:timestamptz" json:"terminated_at,omitempty"`

	// Cost tracking
	EstimatedCostUSD float64 `gorm:"type:decimal(10,4);default:0.0" json:"estimated_cost_usd"`

	// Relationships
	Project          Project           `gorm:"foreignKey:ProjectID" json:"project,omitempty"`
	WorkflowRuns     []WorkflowRun     `gorm:"foreignKey:EnvironmentID" json:"workflow_runs,omitempty"`
	AgentConnections []AgentConnection `gorm:"foreignKey:EnvironmentID" json:"agent_connections,omitempty"`
}

// TableName returns the table name for GORM
func (Environment) TableName() string {
	return "environments"
}
```

**File:** `/Users/yaroslavk/stagely/internal/models/workflow_run.go`

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// WorkflowRun represents a build/deploy/test pipeline execution
type WorkflowRun struct {
	BaseModel

	EnvironmentID uuid.UUID `gorm:"type:uuid;not null;index:idx_workflow_runs_env" json:"environment_id"`

	// Trigger
	Trigger     string     `gorm:"type:varchar(50);not null" json:"trigger"`
	TriggeredBy *uuid.UUID `gorm:"type:uuid" json:"triggered_by,omitempty"`

	// Status
	Status string `gorm:"type:varchar(20);not null;default:'pending';index:idx_workflow_runs_status" json:"status"`

	// Timing
	StartedAt       *time.Time `gorm:"type:timestamptz" json:"started_at,omitempty"`
	CompletedAt     *time.Time `gorm:"type:timestamptz" json:"completed_at,omitempty"`
	DurationSeconds *int       `json:"duration_seconds,omitempty"`

	// Result
	Result       *string `gorm:"type:varchar(20)" json:"result,omitempty"`
	ErrorMessage *string `gorm:"type:text" json:"error_message,omitempty"`

	// Relationships
	Environment Environment `gorm:"foreignKey:EnvironmentID" json:"environment,omitempty"`
	BuildJobs   []BuildJob  `gorm:"foreignKey:WorkflowRunID" json:"build_jobs,omitempty"`
}

// TableName returns the table name for GORM
func (WorkflowRun) TableName() string {
	return "workflow_runs"
}
```

**File:** `/Users/yaroslavk/stagely/internal/models/build_job.go`

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// BuildJob represents an individual Docker image build
type BuildJob struct {
	BaseModel

	WorkflowRunID uuid.UUID `gorm:"type:uuid;not null;index:idx_build_jobs_workflow" json:"workflow_run_id"`

	// Build config
	Name           string  `gorm:"type:varchar(100);not null" json:"name"`
	Architecture   string  `gorm:"type:varchar(20);not null" json:"architecture"`
	ContextPath    *string `gorm:"type:varchar(500)" json:"context_path,omitempty"`
	DockerfilePath *string `gorm:"type:varchar(500)" json:"dockerfile_path,omitempty"`

	// Infrastructure
	VMID            *string    `gorm:"type:varchar(255)" json:"vm_id,omitempty"`
	CloudProviderID *uuid.UUID `gorm:"type:uuid" json:"cloud_provider_id,omitempty"`
	MachineSize     *string    `gorm:"type:varchar(20)" json:"machine_size,omitempty"`

	// Status
	Status string `gorm:"type:varchar(20);not null;default:'queued';index:idx_build_jobs_status" json:"status"`

	// Timing
	QueuedAt        time.Time  `gorm:"default:now();index:idx_build_jobs_queued" json:"queued_at"`
	StartedAt       *time.Time `gorm:"type:timestamptz" json:"started_at,omitempty"`
	CompletedAt     *time.Time `gorm:"type:timestamptz" json:"completed_at,omitempty"`
	DurationSeconds *int       `json:"duration_seconds,omitempty"`

	// Result
	ArtifactURL  *string `gorm:"type:text" json:"artifact_url,omitempty"`
	ExitCode     *int    `json:"exit_code,omitempty"`
	ErrorMessage *string `gorm:"type:text" json:"error_message,omitempty"`

	// Relationships
	WorkflowRun WorkflowRun `gorm:"foreignKey:WorkflowRunID" json:"workflow_run,omitempty"`
	BuildLogs   []BuildLog  `gorm:"foreignKey:BuildJobID" json:"build_logs,omitempty"`
}

// TableName returns the table name for GORM
func (BuildJob) TableName() string {
	return "build_jobs"
}
```

**File:** `/Users/yaroslavk/stagely/internal/models/build_log.go`

```go
package models

import (
	"time"

	"github.com/google/uuid"
)

// BuildLog represents a single line of build output
type BuildLog struct {
	ID          uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	BuildJobID  uuid.UUID `gorm:"type:uuid;not null;index:idx_build_logs_job" json:"build_job_id"`
	Timestamp   time.Time `gorm:"not null;default:now()" json:"timestamp"`
	Stream      string    `gorm:"type:varchar(10);not null" json:"stream"`
	Line        string    `gorm:"type:text;not null" json:"line"`

	// Relationships
	BuildJob BuildJob `gorm:"foreignKey:BuildJobID" json:"build_job,omitempty"`
}

// TableName returns the table name for GORM
func (BuildLog) TableName() string {
	return "build_logs"
}
```

**File:** `/Users/yaroslavk/stagely/internal/models/secret.go`

```go
package models

import "github.com/google/uuid"

// Secret represents an encrypted environment variable or file
type Secret struct {
	BaseModel

	ProjectID uuid.UUID `gorm:"type:uuid;not null;index:idx_secrets_project" json:"project_id"`

	// Secret identity
	Key            string `gorm:"type:varchar(255);not null" json:"key"`
	EncryptedValue string `gorm:"type:text;not null" json:"-"` // Hidden from JSON

	// Scoping
	Scope string `gorm:"type:varchar(50);not null;default:'global';index:idx_secrets_project_scope" json:"scope"`

	// Type
	SecretType      string  `gorm:"type:varchar(20);not null;default:'env'" json:"secret_type"`
	FilePath        *string `gorm:"type:text" json:"file_path,omitempty"`
	FilePermissions *string `gorm:"type:varchar(4)" json:"file_permissions,omitempty"`

	// Metadata
	CreatedBy *uuid.UUID `gorm:"type:uuid" json:"created_by,omitempty"`

	// Relationships
	Project Project `gorm:"foreignKey:ProjectID" json:"project,omitempty"`
}

// TableName returns the table name for GORM
func (Secret) TableName() string {
	return "secrets"
}
```

**File:** `/Users/yaroslavk/stagely/internal/models/audit_log.go`

```go
package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// AuditLog represents an audit trail entry
type AuditLog struct {
	ID uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`

	// Who
	ActorID    *uuid.UUID `gorm:"type:uuid;index:idx_audit_logs_actor" json:"actor_id,omitempty"`
	ActorEmail *string    `gorm:"type:varchar(255)" json:"actor_email,omitempty"`
	ActorIP    *string    `gorm:"type:inet" json:"actor_ip,omitempty"`

	// What
	Action       string     `gorm:"type:varchar(100);not null" json:"action"`
	ResourceType string     `gorm:"type:varchar(50);not null;index:idx_audit_logs_resource" json:"resource_type"`
	ResourceID   *uuid.UUID `gorm:"type:uuid;index:idx_audit_logs_resource" json:"resource_id,omitempty"`

	// Context
	TeamID    *uuid.UUID `gorm:"type:uuid;index:idx_audit_logs_team" json:"team_id,omitempty"`
	ProjectID *uuid.UUID `gorm:"type:uuid" json:"project_id,omitempty"`

	// Details
	Metadata datatypes.JSON `gorm:"type:jsonb" json:"metadata,omitempty"`

	// When
	Timestamp time.Time `gorm:"not null;default:now();index:idx_audit_logs_timestamp,sort:desc" json:"timestamp"`
}

// TableName returns the table name for GORM
func (AuditLog) TableName() string {
	return "audit_logs"
}
```

**File:** `/Users/yaroslavk/stagely/internal/models/agent_connection.go`

```go
package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// AgentConnection represents an active Agent WebSocket connection
type AgentConnection struct {
	ID            uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	EnvironmentID uuid.UUID `gorm:"type:uuid;not null;index:idx_agent_connections_env" json:"environment_id"`

	AgentID   string `gorm:"type:varchar(100);not null;uniqueIndex" json:"agent_id"`
	TokenHash string `gorm:"type:varchar(64);not null" json:"-"` // Hidden from JSON

	// Status
	Status string `gorm:"type:varchar(20);not null;default:'connected'" json:"status"`

	// Metadata
	IPAddress    *string        `gorm:"type:inet" json:"ip_address,omitempty"`
	AgentVersion *string        `gorm:"type:varchar(20)" json:"agent_version,omitempty"`
	SystemInfo   datatypes.JSON `gorm:"type:jsonb" json:"system_info,omitempty"`

	ConnectedAt    time.Time  `gorm:"not null;default:now()" json:"connected_at"`
	LastSeenAt     time.Time  `gorm:"not null;default:now();index:idx_agent_connections_last_seen" json:"last_seen_at"`
	DisconnectedAt *time.Time `gorm:"type:timestamptz" json:"disconnected_at,omitempty"`

	// Relationships
	Environment Environment `gorm:"foreignKey:EnvironmentID" json:"environment,omitempty"`
}

// TableName returns the table name for GORM
func (AgentConnection) TableName() string {
	return "agent_connections"
}
```

### Step 8: Add integration test for all models

Add to `/Users/yaroslavk/stagely/internal/models/models_test.go`:

```go
func TestAllModelsAutoMigrate_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test")
	}

	// Given
	db, cleanup := setupTestDB(t)
	defer cleanup()

	// When - Auto-migrate all models
	err := db.AutoMigrate(
		&models.Team{},
		&models.User{},
		&models.TeamMember{},
		&models.Project{},
		&models.CloudProvider{},
		&models.Environment{},
		&models.WorkflowRun{},
		&models.BuildJob{},
		&models.BuildLog{},
		&models.Secret{},
		&models.AuditLog{},
		&models.AgentConnection{},
	)

	// Then
	require.NoError(t, err)

	// Verify all tables exist
	expectedTables := []string{
		"teams", "users", "team_members", "projects", "cloud_providers",
		"environments", "workflow_runs", "build_jobs", "build_logs",
		"secrets", "audit_logs", "agent_connections",
	}

	for _, table := range expectedTables {
		assert.True(t, db.Migrator().HasTable(table), "Table %s should exist", table)
	}
}
```

### Step 9: Run integration tests

**Command:**

```bash
cd /Users/yaroslavk/stagely
go test ./internal/models -v -run Integration
```

**Expected:** All tests pass, including new test

### Step 10: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely
make test
```

**Expected:** All tests pass

### Step 11: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add internal/models/
git commit -m "feat: add remaining GORM models

- Adds Environment, WorkflowRun, BuildJob, BuildLog models
- Adds Secret, AuditLog, AgentConnection models
- All models match database schema exactly
- Integration test verifies all 12 models auto-migrate"
```

---

## Task 11: Main Entry Point and README

**Objective:** Create cmd/core/main.go entry point and README documentation

**Files:**

- Create: `/Users/yaroslavk/stagely/cmd/core/main.go`
- Create: `/Users/yaroslavk/stagely/README.md`

**Background:**
Main entry point ties together all modules. README provides setup instructions for developers.

### Step 1: Create main.go

**File:** `/Users/yaroslavk/stagely/cmd/core/main.go`

```go
package main

import (
	"fmt"
	"log"
	"os"

	"github.com/stagely-dev/stagely/internal/config"
	"github.com/stagely-dev/stagely/internal/db"
	"github.com/stagely-dev/stagely/internal/models"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	log.Printf("Starting Stagely Core API (environment: %s)", cfg.Server.Environment)

	// Connect to database
	database, err := db.Connect(cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Database connection established")

	// Health check
	if err := db.HealthCheck(database); err != nil {
		log.Fatalf("Database health check failed: %v", err)
	}
	log.Println("Database health check passed")

	// Auto-migrate models (development only)
	if cfg.Server.Environment == "development" {
		log.Println("Running auto-migration (development mode)...")
		err = database.AutoMigrate(
			&models.Team{},
			&models.User{},
			&models.TeamMember{},
			&models.Project{},
			&models.CloudProvider{},
			&models.Environment{},
			&models.WorkflowRun{},
			&models.BuildJob{},
			&models.BuildLog{},
			&models.Secret{},
			&models.AuditLog{},
			&models.AgentConnection{},
		)
		if err != nil {
			log.Fatalf("Auto-migration failed: %v", err)
		}
		log.Println("Auto-migration completed")
	}

	// Phase 0 complete - server starts in Phase 2
	fmt.Printf(`
╔═══════════════════════════════════════════╗
║   Stagely Core - Phase 0 Foundation      ║
║                                           ║
║   Status: ✅ Database Connected           ║
║   Status: ✅ Models Loaded                ║
║   Next: Phase 1 (Cloud Provider Interface)║
╚═══════════════════════════════════════════╝

Phase 0 Complete!

- Database: %s
- Environment: %s
- Log Level: %s

Press Ctrl+C to exit.
`, cfg.Database.URL, cfg.Server.Environment, cfg.Server.LogLevel)

	// Block forever (HTTP server will be added in Phase 2)
	select {}
}
```

### Step 2: Test main.go runs

**Command:**

```bash
cd /Users/yaroslavk/stagely
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"
export REDIS_URL="redis://localhost:6379/0"
go run cmd/core/main.go
```

**Expected output:**

```
Starting Stagely Core API (environment: development)
Database connection established
Database health check passed
Running auto-migration (development mode)...
Auto-migration completed

╔═══════════════════════════════════════════╗
║   Stagely Core - Phase 0 Foundation      ║
...
```

### Step 3: Create README

**File:** `/Users/yaroslavk/stagely/README.md`

````markdown
# Stagely Core

Stagely is a self-hosted ephemeral preview environment platform that provisions VMs, orchestrates Docker builds, and manages WebSocket-connected agents.

**Current Status:** Phase 0 Complete (Foundation & Database Setup)

## Architecture

- **Backend:** Go 1.22+ with Gin framework
- **Database:** PostgreSQL 14+ with GORM
- **Cache:** Redis 7+
- **Container Runtime:** Docker 24+

## Quick Start

### Prerequisites

- Go 1.22+
- Docker and Docker Compose
- Make
- `migrate` CLI: `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest`

### Local Development Setup

1. **Clone the repository:**

```bash
git clone https://github.com/stagely-dev/stagely.git
cd stagely
```
````

2. **Start dependencies:**

```bash
make docker-up
```

This starts PostgreSQL and Redis containers.

3. **Configure environment:**

```bash
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"
export REDIS_URL="redis://localhost:6379/0"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"
```

4. **Run database migrations:**

```bash
make migrate-up
```

5. **Run the Core API:**

```bash
go run cmd/core/main.go
```

You should see:

```
✅ Database Connected
✅ Models Loaded
```

### Running Tests

```bash
# All tests
make test

# Unit tests only
make test-unit

# Integration tests only
make test-integration
```

### Building

```bash
# Build binary
make build

# Run binary
./bin/stagely-core
```

## Project Structure

```
stagely/
├── cmd/
│   └── core/              # Core API entry point
├── internal/
│   ├── config/           # Configuration management
│   ├── crypto/           # Encryption utilities
│   ├── db/               # Database connection
│   └── models/           # GORM models
├── pkg/
│   └── nanoid/           # NanoID generation
├── migrations/           # SQL migrations (14 files)
├── docker-compose.yml    # Local dev environment
└── Makefile             # Build automation
```

## Database Schema

Stagely uses 12 core tables:

- **teams** - Top-level tenants
- **users** - User accounts
- **team_members** - User-team relationships
- **projects** - Git repository configurations
- **cloud_providers** - Encrypted cloud credentials
- **environments** - Preview environments (stagelets)
- **workflow_runs** - Build pipeline tracking
- **build_jobs** - Individual Docker builds
- **build_logs** - Streaming build output
- **secrets** - Encrypted environment variables
- **audit_logs** - Compliance audit trail
- **agent_connections** - Active WebSocket connections

See [docs/architecture/06-database-schema.md](docs/architecture/06-database-schema.md) for details.

## Environment Variables

| Variable         | Required | Default     | Description                               |
| ---------------- | -------- | ----------- | ----------------------------------------- |
| `DATABASE_URL`   | ✅       | -           | PostgreSQL connection string              |
| `REDIS_URL`      | ✅       | -           | Redis connection string                   |
| `PORT`           | ❌       | 8080        | HTTP server port                          |
| `ENVIRONMENT`    | ❌       | development | Environment (development/production)      |
| `LOG_LEVEL`      | ❌       | info        | Log level (debug/info/warn/error)         |
| `ENCRYPTION_KEY` | ⚠️       | -           | 32-byte hex key (required for production) |

## Development Workflow

### Creating a Migration

```bash
make migrate-create NAME=create_my_table
```

### Rolling Back a Migration

```bash
make migrate-down
```

### Linting

```bash
make lint
```

(Requires golangci-lint: `brew install golangci-lint`)

### Cleaning Build Artifacts

```bash
make clean
```

## Testing

### Unit Tests

Fast tests with no external dependencies:

```bash
go test -short ./...
```

### Integration Tests

Tests using testcontainers (requires Docker):

```bash
go test -run Integration ./...
```

### Coverage

```bash
make test
open coverage.html
```

## Roadmap

- ✅ **Phase 0:** Project Foundation & Database Setup
- ⏳ **Phase 1:** Cloud Provider Interface (AWS, DigitalOcean, Hetzner)
- ⏳ **Phase 2:** HTTP API & Authentication
- ⏳ **Phase 3:** WebSocket Hub & Agent Communication
- ⏳ **Phase 4:** Build Pipeline Orchestration
- ⏳ **Phase 5:** Environment Deployment
- ⏳ **Phase 6:** Secrets Management
- ⏳ **Phase 7:** Environment Monitoring & Reaper
- ⏳ **Phase 8:** Docker Registry Integration
- ⏳ **Phase 9:** Observability & Logging

See [docs/roadmaps/2025-12-06-stagely-core-roadmap.md](docs/roadmaps/2025-12-06-stagely-core-roadmap.md) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests
4. Implement your feature
5. Run tests and linting
6. Submit a pull request

## License

[MIT License](LICENSE)

## Support

- Documentation: [docs/architecture/](docs/architecture/)
- Issues: [GitHub Issues](https://github.com/stagely-dev/stagely/issues)

````

### Step 4: Test README instructions

Follow README quick start steps manually to verify they work.

### Step 5: Run full test suite

**Command:**

```bash
cd /Users/yaroslavk/stagely
make test
````

**Expected:** All tests pass

### Step 6: Build binary

**Command:**

```bash
cd /Users/yaroslavk/stagely
make build
```

**Expected output:**

```
Building stagely-core...
```

**Verify:**

```bash
./bin/stagely-core
```

(Should fail with config error if env vars not set - that's correct!)

### Step 7: Commit

**Command:**

```bash
cd /Users/yaroslavk/stagely
git add cmd/core/main.go README.md
git commit -m "feat: add main entry point and README

- Adds cmd/core/main.go with config, database, health check
- Adds comprehensive README with quickstart, structure, env vars
- Phase 0 foundation complete and ready for use"
```

---

## Integration Testing

After all tasks complete:

### Test: End-to-end workflow

**Objective:** Verify all components work together

**Command:**

```bash
cd /Users/yaroslavk/stagely

# Clean start
make docker-down
make docker-up
sleep 5

# Set env vars
export DATABASE_URL="postgres://stagely:stagely@localhost:5432/stagely?sslmode=disable"
export REDIS_URL="redis://localhost:6379/0"
export ENCRYPTION_KEY="$(openssl rand -hex 32)"

# Run migrations
make migrate-up

# Run application
timeout 5 go run cmd/core/main.go || true

# Verify database has tables
docker exec -it stagely-postgres psql -U stagely -d stagely -c "\dt" | grep -c "table"
```

**Expected output:** 12 tables present

### Test: Encryption round-trip

**Objective:** Verify encryption works end-to-end

**Create test file:** `/Users/yaroslavk/stagely/test_encrypt.go`

```go
package main

import (
	"fmt"
	"log"

	"github.com/stagely-dev/stagely/internal/crypto"
)

func main() {
	// Generate key
	key, err := crypto.GenerateKey()
	if err != nil {
		log.Fatal(err)
	}

	plaintext := "my-secret-database-password"

	// Encrypt
	ciphertext, err := crypto.Encrypt(plaintext, key)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Encrypted: %s\n", ciphertext[:40]+"...")

	// Decrypt
	decrypted, err := crypto.Decrypt(ciphertext, key)
	if err != nil {
		log.Fatal(err)
	}

	if decrypted == plaintext {
		fmt.Println("✅ Encryption round-trip successful")
	} else {
		log.Fatal("❌ Decryption mismatch!")
	}
}
```

**Command:**

```bash
cd /Users/yaroslavk/stagely
go run test_encrypt.go
rm test_encrypt.go
```

**Expected output:**

```
Encrypted: iJ8kL3mN...
✅ Encryption round-trip successful
```

### Test: NanoID uniqueness

**Create test file:** `/Users/yaroslavk/stagely/test_nanoid.go`

```go
package main

import (
	"fmt"

	"github.com/stagely-dev/stagely/pkg/nanoid"
)

func main() {
	ids := make(map[string]bool)
	for i := 0; i < 100; i++ {
		id := nanoid.Generate()
		if ids[id] {
			fmt.Printf("❌ Duplicate ID found: %s\n", id)
			return
		}
		ids[id] = true
	}
	fmt.Printf("✅ Generated 100 unique IDs\n")
	fmt.Printf("Example: %s\n", nanoid.Generate())
}
```

**Command:**

```bash
cd /Users/yaroslavk/stagely
go run test_nanoid.go
rm test_nanoid.go
```

**Expected output:**

```
✅ Generated 100 unique IDs
Example: a8f9d2k1p4m7
```

---

## Verification Checklist

Before considering Phase 0 complete:

- [x] Go module initialized with all dependencies
- [x] All directories created (cmd, internal, pkg, migrations)
- [x] Configuration loads DATABASE_URL from env
- [x] Database connection successful
- [x] All 14 migrations run without errors
- [x] All GORM models compile
- [x] Teams CRUD operations work
- [x] NanoID generates 12-character strings
- [x] Encryption round-trip successful
- [x] Docker Compose starts PostgreSQL
- [x] Makefile has all targets
- [x] All unit tests pass
- [x] All integration tests pass
- [x] README documents local setup
- [x] Code builds successfully
- [x] Linter passes (if installed)

---

## Rollback Plan

If issues discovered after integration:

1. **Immediate:** Revert to last stable commit: `git revert HEAD`
2. **Diagnosis:** Check logs, test failures, migration status
3. **Fix:** Address specific issue (config, migration, model mismatch)
4. **Verification:** Re-run full test suite and integration tests

---

## Notes for Implementation

**Common Pitfalls:**

- **Migration order:** Foreign keys require parent table to exist first. Migrations are numbered correctly.
- **GORM tags:** Column names in tags must match SQL schema exactly (snake_case).
- **Testcontainers:** Requires Docker running. Tests will fail if Docker is down.
- **Environment variables:** Tests clean env vars. Use `defer os.Clearenv()` in tests.

**Performance Considerations:**

- Connection pool size (25) is conservative. Tune based on load.
- Build logs table will grow quickly. Plan retention policy (not in Phase 0).
- Indexes added for common queries. Monitor slow query log in production.

**Security Considerations:**

- Encryption key must be 32 bytes (256 bits). Document key rotation process.
- Cloud credentials encrypted at rest. Never log decrypted values.
- Audit logs capture sensitive operations. Immutable (no updates/deletes).

**Dependencies:**

None - Phase 0 is self-contained.

---

**Next Steps:** Begin Phase 1 (Cloud Provider Interface)

**Estimated Time:** 16 hours for experienced Go developer
