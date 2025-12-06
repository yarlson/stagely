# Stagely Secrets Management and Deployment

## Overview

Stagely provides a hierarchical secrets management system that allows users to securely store stagelet variables and files, scoped to specific services or shared globally. Secrets are encrypted at rest, transmitted over TLS, and injected into containers at deployment time using Docker Compose overrides.

## Design Principles

1. **Never Touch User Files**: We don't modify the user's `docker-compose.yml` or source code
2. **Zero Config**: Works with standard Docker Compose without custom loaders
3. **Hierarchical Scoping**: Secrets can be global (all services) or service-specific
4. **Zero Disk Persistence**: Secret override files are ephemeral (deleted after deployment)
5. **Log Masking**: Secret values are automatically redacted from logs

## Secrets Storage

### Database Schema

```sql
CREATE TABLE secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    encrypted_value TEXT NOT NULL,
    scope VARCHAR(50) NOT NULL DEFAULT 'global',
    secret_type VARCHAR(20) NOT NULL DEFAULT 'env',
    file_path TEXT NULL,
    file_permissions VARCHAR(4) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    CONSTRAINT unique_secret_per_scope UNIQUE(project_id, key, scope),
    CONSTRAINT valid_scope CHECK (scope IN ('global') OR scope ~ '^[a-zA-Z0-9_-]+$'),
    CONSTRAINT valid_type CHECK (secret_type IN ('env', 'file'))
);

CREATE INDEX idx_secrets_project_scope ON secrets(project_id, scope);
```

**Field Descriptions:**

- `project_id`: Secrets belong to a project (not stagelet-specific)
- `key`: Variable name (e.g., `DATABASE_URL`, `STRIPE_SECRET_KEY`)
- `encrypted_value`: AES-256-GCM encrypted value
- `scope`:
  - `global`: Injected into all services
  - `<service_name>`: Injected only into that service (e.g., `backend`, `frontend`)
- `secret_type`:
  - `env`: Stagelet variable
  - `file`: Physical file written to disk
- `file_path`: For `file` type, where to write it (e.g., `./config/firebase.json`)
- `file_permissions`: For `file` type, octal permissions (e.g., `0600`)

### Encryption

**Algorithm:** AES-256-GCM

**Implementation (Go):**

```go
import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "encoding/base64"
    "io"
)

// EncryptSecret encrypts plaintext using AES-256-GCM
func EncryptSecret(plaintext string, key []byte) (string, error) {
    block, err := aes.NewCipher(key) // key must be 32 bytes
    if err != nil {
        return "", err
    }

    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", err
    }

    nonce := make([]byte, gcm.NonceSize())
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
        return "", err
    }

    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
    return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptSecret decrypts ciphertext using AES-256-GCM
func DecryptSecret(ciphertext string, key []byte) (string, error) {
    data, err := base64.StdEncoding.DecodeString(ciphertext)
    if err != nil {
        return "", err
    }

    block, err := aes.NewCipher(key)
    if err != nil {
        return "", err
    }

    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return "", err
    }

    nonceSize := gcm.NonceSize()
    nonce, ciphertext := data[:nonceSize], data[nonceSize:]

    plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
    if err != nil {
        return "", err
    }

    return string(plaintext), nil
}
```

**Key Management:**

Option 1 (Simple): Single master key stored in stagelet variable
```bash
STAGELY_SECRET_KEY=your-32-byte-base64-encoded-key
```

Option 2 (Production): Use AWS KMS, Google Cloud KMS, or HashiCorp Vault
- Store only the KMS key ID in the stagelet
- Call KMS API to decrypt data keys

### Access Control

Users can only access secrets for projects within their team:

```sql
-- Check if user has access to project
SELECT 1 FROM projects p
JOIN team_members tm ON tm.team_id = p.team_id
WHERE p.id = $1 AND tm.user_id = $2;
```

## Secrets Injection (The "Override Strategy")

### The Problem

Different services in a `docker-compose.yml` may need:
- Different values for the same key (e.g., `PORT=8080` for backend, `PORT=3000` for frontend)
- Access to different secrets (e.g., `STRIPE_SECRET_KEY` only in backend, not frontend)

### The Solution

Generate a temporary `docker-compose.stagely.yml` file that Docker merges with the user's original file.

### Example

**User's `docker-compose.yml`:**
```yaml
version: '3'
services:
  backend:
    image: my-api
    ports:
      - "8080:8080"

  frontend:
    image: my-ui
    ports:
      - "3000:3000"

  postgres:
    image: postgres:14
```

**Secrets in Stagely Dashboard:**

| Key | Value | Scope | Type |
|-----|-------|-------|------|
| DATABASE_URL | postgres://user:pass@postgres:5432/db | global | env |
| REDIS_URL | redis://redis:6379 | global | env |
| PORT | 8080 | backend | env |
| PORT | 3000 | frontend | env |
| STRIPE_SECRET_KEY | sk_test_abc123 | backend | env |
| NEXT_PUBLIC_API_URL | https://api.example.com | frontend | env |

**Agent-Generated `docker-compose.stagely.yml`:**
```yaml
version: '3'
services:
  backend:
    stagelet:
      - DATABASE_URL=postgres://user:pass@postgres:5432/db
      - REDIS_URL=redis://redis:6379
      - PORT=8080
      - STRIPE_SECRET_KEY=sk_test_abc123

  frontend:
    stagelet:
      - DATABASE_URL=postgres://user:pass@postgres:5432/db
      - REDIS_URL=redis://redis:6379
      - PORT=3000
      - NEXT_PUBLIC_API_URL=https://api.example.com

  postgres:
    stagelet:
      - DATABASE_URL=postgres://user:pass@postgres:5432/db
      - REDIS_URL=redis://redis:6379
```

**Execution:**
```bash
docker compose -f docker-compose.yml -f docker-compose.stagely.yml up -d
```

**Result:**
- `backend` gets PORT=8080 and STRIPE_SECRET_KEY
- `frontend` gets PORT=3000 and NEXT_PUBLIC_API_URL
- `postgres` gets only global secrets
- No namespace collisions

## Agent Implementation

### Step 1: Parse User's Compose File

Agent needs to know which services exist to inject global secrets.

```go
import "github.com/compose-spec/compose-go/loader"

func ParseComposeFile(path string) ([]string, error) {
    config, err := loader.Load(loader.ConfigDetails{
        WorkingDir: ".",
        ConfigFiles: []loader.ConfigFile{
            {Filename: path},
        },
    })
    if err != nil {
        return nil, err
    }

    var serviceNames []string
    for name := range config.Services {
        serviceNames = append(serviceNames, name)
    }
    return serviceNames, nil
}
```

### Step 2: Generate Override File

```go
type Secret struct {
    Key   string
    Value string
    Scope string // "global" or service name
    Type  string // "env" or "file"
}

func GenerateOverride(services []string, secrets []Secret) string {
    type ServiceEnv struct {
        Stagelet []string `yaml:"stagelet"`
    }

    override := map[string]interface{}{
        "version": "3",
        "services": make(map[string]ServiceEnv),
    }

    serviceMap := override["services"].(map[string]ServiceEnv)

    // Initialize each service
    for _, svc := range services {
        serviceMap[svc] = ServiceEnv{Stagelet: []string{}}
    }

    // Inject secrets
    for _, secret := range secrets {
        if secret.Type != "env" {
            continue // Handle files separately
        }

        if secret.Scope == "global" {
            // Add to all services
            for svc := range serviceMap {
                env := serviceMap[svc]
                env.Stagelet = append(env.Stagelet,
                    fmt.Sprintf("%s=%s", secret.Key, secret.Value))
                serviceMap[svc] = env
            }
        } else {
            // Add only to specific service
            if env, ok := serviceMap[secret.Scope]; ok {
                env.Stagelet = append(env.Stagelet,
                    fmt.Sprintf("%s=%s", secret.Key, secret.Value))
                serviceMap[secret.Scope] = env
            }
        }
    }

    yaml, _ := yaml.Marshal(override)
    return string(yaml)
}
```

### Step 3: Write Temporary File

```go
func WriteOverrideFile(content string) error {
    return os.WriteFile("docker-compose.stagely.yml", []byte(content), 0600)
}
```

### Step 4: Execute Deployment

```go
func Deploy() error {
    cmd := exec.Command("docker", "compose",
        "-f", "docker-compose.yml",
        "-f", "docker-compose.stagely.yml",
        "up", "-d")

    output, err := cmd.CombinedOutput()
    log.Println(string(output))
    return err
}
```

### Step 5: Cleanup

```go
func Cleanup() error {
    return os.Remove("docker-compose.stagely.yml")
}
```

**Full Deployment Flow:**

```go
func ExecuteDeploy(msg DeployMessage) error {
    // 1. Parse existing compose file
    services, err := ParseComposeFile("docker-compose.yml")
    if err != nil {
        return err
    }

    // 2. Generate override
    override := GenerateOverride(services, msg.Secrets)

    // 3. Write temporary file
    if err := WriteOverrideFile(override); err != nil {
        return err
    }
    defer Cleanup()

    // 4. Run deployment
    if err := Deploy(); err != nil {
        return err
    }

    // 5. Wait for health check
    time.Sleep(5 * time.Second)

    // 6. Check container status
    status, err := CheckHealth()
    if err != nil {
        return err
    }

    // 7. Report back to Core
    SendStatus(status)

    return nil
}
```

## File Secrets

Some applications require physical files (e.g., Firebase service account JSON, SSL certificates).

### Storage

```sql
INSERT INTO secrets (project_id, key, encrypted_value, scope, secret_type, file_path, file_permissions)
VALUES (
    'proj_123',
    'FIREBASE_CREDENTIALS',
    '<encrypted_json>',
    'backend',
    'file',
    './config/firebase-admin.json',
    '0600'
);
```

### Agent Handling

When `secret_type = 'file'`:

1. Agent decrypts the value
2. Writes to specified `file_path` (relative to repo root)
3. Sets file permissions
4. Docker Compose can then mount this file

```go
func WriteFileSecret(secret Secret) error {
    // Ensure directory exists
    dir := filepath.Dir(secret.FilePath)
    if err := os.MkdirAll(dir, 0755); err != nil {
        return err
    }

    // Write file
    if err := os.WriteFile(secret.FilePath, []byte(secret.Value), 0600); err != nil {
        return err
    }

    // Set permissions if specified
    if secret.FilePermissions != "" {
        perm, _ := strconv.ParseUint(secret.FilePermissions, 8, 32)
        os.Chmod(secret.FilePath, os.FileMode(perm))
    }

    return nil
}
```

**Important:** File secrets are written to disk (unavoidable). The Agent must:
- Write them to a directory outside the Git repo (to avoid accidental commits)
- Delete them on cleanup or VM termination

### Docker Compose Integration

User's compose file can reference the file:

```yaml
services:
  backend:
    volumes:
      - ./config/firebase-admin.json:/app/config/firebase-admin.json:ro
```

## Log Masking

To prevent secrets from leaking in logs, the Agent masks them before streaming to Core.

### Implementation

```go
type SecretMasker struct {
    secrets []string
}

func NewSecretMasker(secrets []Secret) *SecretMasker {
    var values []string
    for _, s := range secrets {
        if len(s.Value) > 0 {
            values = append(values, s.Value)
        }
    }
    return &SecretMasker{secrets: values}
}

func (m *SecretMasker) Mask(logLine string) string {
    for _, secret := range m.secrets {
        logLine = strings.ReplaceAll(logLine, secret, "***REDACTED***")
    }
    return logLine
}
```

**Usage:**

```go
masker := NewSecretMasker(msg.Secrets)

scanner := bufio.NewScanner(cmd.Stdout)
for scanner.Scan() {
    line := scanner.Text()
    maskedLine := masker.Mask(line)
    SendLog(maskedLine)
}
```

**Example:**

Before masking:
```
Connecting to postgres://user:mypassword@db:5432/mydb
```

After masking:
```
Connecting to ***REDACTED***
```

## Secret Rotation

When a user updates a secret in the Dashboard:

1. Dashboard sends update request to Core API
2. Core encrypts new value and updates database
3. Core sends DEPLOY message to Agent (with updated secrets)
4. Agent regenerates override file with new values
5. Agent runs `docker compose up -d`
6. Docker detects stagelet variable change
7. Docker recreates only the affected containers (smart restart)

**No manual intervention required.**

## Security Best Practices

### For Stagely Operators

1. **Rotate Master Key Regularly**: Re-encrypt all secrets annually
2. **Use KMS**: Don't store master key in plain text
3. **Audit Logs**: Track who accessed/modified secrets
4. **Principle of Least Privilege**: Users can only access their team's secrets

### For End Users

1. **Use Different Secrets Per Stagelet**: Don't reuse production secrets in preview envs
2. **Scope Secrets Tightly**: Use service-specific scope when possible (not `global`)
3. **Rotate After Developer Offboarding**: Change secrets when team members leave
4. **Never Commit `.env` Files**: Stagely injects them at runtime

## API Endpoints

### Create Secret

```http
POST /api/v1/projects/:project_id/secrets
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "key": "STRIPE_SECRET_KEY",
  "value": "sk_test_abc123",
  "scope": "backend",
  "type": "env"
}
```

**Response:**
```json
{
  "id": "sec_xk82j9s7",
  "key": "STRIPE_SECRET_KEY",
  "scope": "backend",
  "type": "env",
  "created_at": "2025-12-06T14:30:00Z"
}
```

**Note:** `value` is not returned in response (security).

### List Secrets

```http
GET /api/v1/projects/:project_id/secrets
Authorization: Bearer <user_token>
```

**Response:**
```json
{
  "secrets": [
    {
      "id": "sec_xk82j9s7",
      "key": "STRIPE_SECRET_KEY",
      "scope": "backend",
      "type": "env",
      "created_at": "2025-12-06T14:30:00Z",
      "updated_at": "2025-12-06T14:30:00Z"
    }
  ]
}
```

### Update Secret

```http
PATCH /api/v1/projects/:project_id/secrets/:secret_id
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "value": "sk_live_new_key"
}
```

**Response:**
```json
{
  "id": "sec_xk82j9s7",
  "key": "STRIPE_SECRET_KEY",
  "scope": "backend",
  "updated_at": "2025-12-06T15:00:00Z"
}
```

**Side Effect:** All active stagelets for this project are automatically redeployed with the new secret.

### Delete Secret

```http
DELETE /api/v1/projects/:project_id/secrets/:secret_id
Authorization: Bearer <user_token>
```

**Response:**
```json
{
  "status": "deleted"
}
```

## Stagelet Variables vs. Files

### When to Use Stagelet Variables

- API keys
- Database URLs
- Feature flags
- Port numbers
- Simple configuration strings

### When to Use File Secrets

- SSL certificates (.pem, .crt, .key)
- Firebase service account JSON
- OAuth client secrets (JSON files)
- Large configuration files

**Rule of Thumb:** If the value is > 1 KB or contains newlines/binary data, use a file secret.

## Compliance Considerations

### GDPR

- Secrets are encrypted at rest (Article 32)
- Access logs track who accessed secrets (Article 30)
- Users can delete secrets (Right to Erasure, Article 17)

### SOC 2

- Encryption in transit (TLS 1.3)
- Encryption at rest (AES-256-GCM)
- Access control (RBAC via team membership)
- Audit logging (all secret CRUD operations logged)

### PCI-DSS

- If storing payment card data, use separate encryption keys
- Rotate keys quarterly
- Implement "break-glass" emergency access (admin override)

## Troubleshooting

### Issue: Container Crashes After Secret Update

**Symptom:** Container starts, then immediately exits with code 1.

**Cause:** New secret value is malformed (e.g., invalid JSON, wrong format).

**Solution:**
1. Check logs: Agent sends last 20 lines to Core
2. Rollback: Revert secret to previous value in Dashboard
3. Core automatically redeploys with old value

### Issue: Secret Not Appearing in Container

**Symptom:** Application can't read stagelet variable.

**Cause:** Typo in scope (e.g., `Scope: "Backend"` instead of `"backend"`)

**Solution:**
1. Check scope matches service name exactly (case-sensitive)
2. Update scope in Dashboard
3. Redeploy (Core sends new DEPLOY message)

### Issue: Secret Visible in Logs

**Symptom:** Secret value appears in plain text in Dashboard logs.

**Cause:** Secret masking failed (secret value too short, or contains special regex chars).

**Solution:**
1. Update masking regex to escape special characters
2. Set minimum secret length (e.g., 8 characters) to avoid false positives

## Testing

### Unit Tests

```go
func TestSecretMasking(t *testing.T) {
    secrets := []Secret{
        {Key: "API_KEY", Value: "abc123secret"},
    }
    masker := NewSecretMasker(secrets)

    input := "Connecting with API_KEY=abc123secret"
    output := masker.Mask(input)

    expected := "Connecting with API_KEY=***REDACTED***"
    if output != expected {
        t.Errorf("Expected %s, got %s", expected, output)
    }
}
```

### Integration Tests

1. Create a test project
2. Add a secret via API
3. Deploy a test stagelet
4. Exec into container: `docker compose exec backend env | grep SECRET_KEY`
5. Verify secret is present
6. Update secret via API
7. Verify container restarted automatically
8. Verify new value is present

## Performance Considerations

- **Encryption Overhead**: Negligible (< 1ms per secret)
- **Override File Generation**: O(n * m) where n = services, m = secrets (typically < 10ms)
- **Docker Compose Merge**: Native Docker operation (< 100ms)
- **Secret Lookup**: Database query with index (< 5ms)

**Bottleneck:** Network latency (Agent WebSocket → Core API).

**Optimization:** Batch secrets into single DEPLOY message (already implemented).

## Future Enhancements

1. **Secret Versioning**: Track history of secret changes (audit trail)
2. **Expiration**: Auto-rotate secrets after X days
3. **External Integrations**: Pull secrets from AWS Secrets Manager, 1Password, etc.
4. **Just-In-Time Access**: Require approval for accessing production secrets
5. **Secret Scanning**: Detect secrets accidentally committed to Git repos
