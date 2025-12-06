# Stagely Build Pipeline and Multi-Architecture Support

## Overview

Stagely's build pipeline separates the "build" phase from the "run" phase to optimize resource utilization and costs. Builds run on ephemeral, high-CPU VMs (Builder Fleet), while applications run on long-lived, appropriately-sized VMs (Preview Fleet). The system supports parallel builds for monorepos and native multi-architecture Docker images (AMD64/ARM64).

## Architecture

### Three-Fleet Model

```
┌─────────────────────────────────────────────────────┐
│  Builder Fleet (Ephemeral, High-CPU)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Builder VM   │  │ Builder VM   │  │ Builder  │  │
│  │ (AMD64)      │  │ (ARM64)      │  │ (AMD64)  │  │
│  │ c5.xlarge    │  │ t4g.xlarge   │  │ ...      │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│  Lifecycle: 5-15 minutes                            │
└─────────────────────────────────────────────────────┘
                           │
                           │ (Pushes images)
                           v
              ┌───────────────────────┐
              │  Docker Registry      │
              │  (Internal)           │
              └───────────────────────┘
                           │
                           │ (Pulls images)
                           v
┌─────────────────────────────────────────────────────┐
│  Preview Fleet (Long-Lived, Right-Sized)            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Preview VM   │  │ Preview VM   │  │ Preview  │  │
│  │ t3.medium    │  │ t3.large     │  │ ...      │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│  Lifecycle: Hours to days                           │
└─────────────────────────────────────────────────────┘
                           │
                           │ (Tested against)
                           v
┌─────────────────────────────────────────────────────┐
│  Tester Fleet (Ephemeral, High-RAM)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ Tester VM    │  │ Tester VM    │  │ Tester   │  │
│  │ c5.2xlarge   │  │ c5.2xlarge   │  │ ...      │  │
│  └──────────────┘  └──────────────┘  └──────────┘  │
│  Lifecycle: 5-30 minutes                            │
└─────────────────────────────────────────────────────┘
```

### Cost Comparison

| Fleet | Instance Type | Cost/Hour | Typical Runtime | Cost/Build |
|-------|--------------|-----------|-----------------|------------|
| Builder | c5.xlarge (4vCPU, 8GB) | $0.17 | 10 min | $0.03 |
| Preview | t3.medium (2vCPU, 4GB) | $0.04 | 4 hours | $0.16 |
| Tester | c5.2xlarge (8vCPU, 16GB) | $0.34 | 15 min | $0.09 |

**Total cost per PR:** ~$0.28 (assuming single-arch build)

## Workflow States

### Workflow Run (Parent)

A Workflow Run represents the entire lifecycle of a PR environment.

```sql
CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    trigger VARCHAR(50) NOT NULL, -- 'pr_opened', 'pr_synchronized', 'manual'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN (
        'pending',
        'building',
        'deploying',
        'testing',
        'completed',
        'failed'
    ))
);

CREATE INDEX idx_workflow_runs_env ON workflow_runs(environment_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
```

**Status Transitions:**

```
pending → building → deploying → testing → completed
    ↓         ↓          ↓          ↓
  failed    failed    failed    failed
```

### Build Job (Child)

A Build Job represents a single build task (e.g., building the "backend" service for AMD64).

```sql
CREATE TABLE build_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- 'backend_amd64', 'frontend', etc.
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    architecture VARCHAR(20) NOT NULL, -- 'amd64', 'arm64', 'multi'
    vm_id VARCHAR(255) NULL, -- Cloud provider VM ID
    artifact_url TEXT NULL, -- Docker image URL in registry
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    exit_code INT NULL,
    error_message TEXT NULL,

    CONSTRAINT valid_status CHECK (status IN (
        'queued',
        'provisioning',
        'running',
        'completed',
        'failed'
    ))
);

CREATE INDEX idx_build_jobs_workflow ON build_jobs(workflow_run_id);
CREATE INDEX idx_build_jobs_status ON build_jobs(status);
```

## Fan-Out: Parallel Build Orchestration

### Scenario

A monorepo with multiple services:

```yaml
# stagely.yaml
builds:
  backend_amd64:
    context: "./api"
    platform: "linux/amd64"
    machine: "medium"

  worker_arm64:
    context: "./worker"
    platform: "linux/arm64"
    machine: "small"

  frontend:
    context: "./web"
    platform: "linux/amd64"
    machine: "large"
```

### Core Orchestrator Logic

```go
func (o *Orchestrator) HandlePROpened(pr PullRequest) error {
    // 1. Parse stagely.yaml
    config, err := o.ParseStagelyConfig(pr.RepoURL, pr.CommitHash)
    if err != nil {
        return err
    }

    // 2. Create workflow run
    workflowRun := o.DB.CreateWorkflowRun(pr.EnvironmentID, "pr_opened")

    // 3. Create build jobs (fan-out)
    var jobs []BuildJob
    for name, buildSpec := range config.Builds {
        job := BuildJob{
            WorkflowRunID: workflowRun.ID,
            Name:          name,
            Architecture:  buildSpec.Platform,
            Status:        "queued",
        }
        jobs = append(jobs, o.DB.CreateBuildJob(job))
    }

    // 4. Provision VMs in parallel (non-blocking)
    for _, job := range jobs {
        go o.ProvisionBuilderVM(job)
    }

    return nil
}

func (o *Orchestrator) ProvisionBuilderVM(job BuildJob) error {
    // Select cloud provider based on architecture
    provider := o.SelectProvider(job.Architecture)

    // Provision VM
    vmID, err := provider.CreateInstance(MachineSpec{
        Size:   "high-cpu",
        Arch:   job.Architecture,
        UserData: o.GenerateBuildScript(job),
    })
    if err != nil {
        o.DB.UpdateBuildJob(job.ID, BuildJob{Status: "failed", ErrorMessage: err.Error()})
        return err
    }

    // Update job with VM ID
    o.DB.UpdateBuildJob(job.ID, BuildJob{Status: "provisioning", VMID: vmID})

    return nil
}
```

### Build Execution (Agent)

When a Builder VM boots:

1. Agent connects to Core via WebSocket
2. Core sends BUILD message
3. Agent executes build
4. Agent pushes image to Internal Registry
5. Agent reports STATUS: completed
6. Core terminates VM

**BUILD Message:**

```json
{
  "type": "BUILD",
  "job_id": "job_build_xk82",
  "context": {
    "repo_url": "https://github.com/user/repo.git",
    "commit_hash": "abc123def456",
    "branch": "feature/new-api",
    "clone_token": "github_pat_..."
  },
  "build_config": {
    "context_path": "./api",
    "dockerfile": "Dockerfile",
    "target_image": "registry.internal/proj-123/env-456:backend-amd64",
    "platform": "linux/amd64",
    "build_args": {
      "NODE_ENV": "staging"
    },
    "cache_from": [
      "registry.internal/proj-123/cache:backend"
    ],
    "cache_to": "registry.internal/proj-123/cache:backend"
  },
  "registry_auth": {
    "username": "stagely",
    "password": "reg_token_..."
  }
}
```

**Agent Execution:**

```bash
# Clone repo
git clone https://oauth2:${CLONE_TOKEN}@github.com/user/repo.git /workspace
cd /workspace
git checkout abc123def456

# Docker login
echo "${REGISTRY_PASSWORD}" | docker login registry.internal -u stagely --password-stdin

# Build with cache
docker buildx build \
  --platform linux/amd64 \
  --cache-from=type=registry,ref=registry.internal/proj-123/cache:backend \
  --cache-to=type=registry,ref=registry.internal/proj-123/cache:backend,mode=max \
  --build-arg NODE_ENV=staging \
  -t registry.internal/proj-123/env-456:backend-amd64 \
  -f Dockerfile \
  --push \
  ./api
```

**Log Streaming:**

Agent sends LOG messages for every line of `docker buildx` output:

```json
{
  "type": "LOG",
  "job_id": "job_build_xk82",
  "stream": "stdout",
  "data": "#5 [2/5] RUN npm install\n"
}
```

**Completion:**

```json
{
  "type": "STATUS",
  "job_id": "job_build_xk82",
  "state": "completed",
  "exit_code": 0,
  "artifact_url": "registry.internal/proj-123/env-456:backend-amd64"
}
```

Core updates database:

```sql
UPDATE build_jobs
SET status = 'completed',
    artifact_url = 'registry.internal/proj-123/env-456:backend-amd64',
    completed_at = NOW()
WHERE id = 'job_build_xk82';
```

Core terminates VM:

```go
provider.TerminateInstance(job.VMID)
```

## Fan-In: Synchronization Point

Core monitors build job completion:

```go
func (o *Orchestrator) MonitorWorkflowRun(workflowRunID string) {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        // Check if all build jobs are done
        jobs := o.DB.GetBuildJobs(workflowRunID)
        allDone := true
        anyFailed := false

        for _, job := range jobs {
            if job.Status != "completed" && job.Status != "failed" {
                allDone = false
                break
            }
            if job.Status == "failed" {
                anyFailed = true
            }
        }

        if !allDone {
            continue // Keep waiting
        }

        if anyFailed {
            o.DB.UpdateWorkflowRun(workflowRunID, WorkflowRun{Status: "failed"})
            o.NotifyGitHub(workflowRunID, "❌ Build failed")
            return
        }

        // All builds completed successfully
        o.DB.UpdateWorkflowRun(workflowRunID, WorkflowRun{Status: "deploying"})
        o.TriggerDeploy(workflowRunID)
        return
    }
}
```

## Multi-Architecture Images

### Scenario

User wants a single Docker image tag that works on both Intel and ARM chips:

```yaml
builds:
  app:
    context: "."
    platforms:
      - "linux/amd64"
      - "linux/arm64"
    machine: "medium"
```

### Orchestrator Logic

Core expands this into multiple build jobs + 1 merge job:

```go
func (o *Orchestrator) ExpandMultiArchBuild(buildSpec BuildSpec) []BuildJob {
    var jobs []BuildJob

    // Create a job for each platform
    for _, platform := range buildSpec.Platforms {
        jobs = append(jobs, BuildJob{
            Name:         fmt.Sprintf("%s_%s", buildSpec.Name, platformToArch(platform)),
            Architecture: platformToArch(platform), // "amd64" or "arm64"
            Status:       "queued",
        })
    }

    // Create a merge job (depends on above jobs)
    jobs = append(jobs, BuildJob{
        Name:         fmt.Sprintf("%s_merge", buildSpec.Name),
        Architecture: "multi",
        Status:       "queued",
        DependsOn:    jobs, // Can't start until all platform jobs complete
    })

    return jobs
}
```

### Build Phase (Per-Platform)

Two VMs are provisioned:

1. **AMD64 Builder:**
   - Builds and pushes `registry.internal/proj/env:app-amd64`

2. **ARM64 Builder:**
   - Builds and pushes `registry.internal/proj/env:app-arm64`

### Merge Phase

Once both complete, Core provisions a small VM (any arch) to run the merge:

**MERGE Message:**

```json
{
  "type": "MERGE",
  "job_id": "job_merge_xk82",
  "source_images": [
    "registry.internal/proj/env:app-amd64",
    "registry.internal/proj/env:app-arm64"
  ],
  "target_image": "registry.internal/proj/env:app",
  "registry_auth": {
    "username": "stagely",
    "password": "reg_token_..."
  }
}
```

**Agent Execution:**

```bash
# Login
echo "${REGISTRY_PASSWORD}" | docker login registry.internal -u stagely --password-stdin

# Create multi-arch manifest
docker buildx imagetools create -t registry.internal/proj/env:app \
  registry.internal/proj/env:app-amd64 \
  registry.internal/proj/env:app-arm64
```

**Result:**

A single tag `registry.internal/proj/env:app` now contains both architectures. When a Preview VM pulls this image, Docker automatically selects the correct variant for the host's architecture.

**Verification:**

```bash
docker manifest inspect registry.internal/proj/env:app
```

Output:

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.docker.distribution.manifest.list.v2+json",
  "manifests": [
    {
      "platform": {
        "architecture": "amd64",
        "os": "linux"
      },
      "digest": "sha256:abc123..."
    },
    {
      "platform": {
        "architecture": "arm64",
        "os": "linux"
      },
      "digest": "sha256:def456..."
    }
  ]
}
```

## Registry Layer Caching

To speed up incremental builds, we use Docker Registry as a cache backend.

### Cache Keys

```
registry.internal/{project_id}/cache:{service_name}
```

**Example:**

- `registry.internal/proj-123/cache:backend`
- `registry.internal/proj-123/cache:frontend`

### Build Command (with cache)

```bash
docker buildx build \
  --cache-from=type=registry,ref=registry.internal/proj-123/cache:backend \
  --cache-to=type=registry,ref=registry.internal/proj-123/cache:backend,mode=max \
  ...
```

**How it works:**

1. `--cache-from`: Pull existing layers from registry before building
2. Build executes (reuses matching layers)
3. `--cache-to`: Push all layers back to registry (including new ones)
4. `mode=max`: Cache all stages (not just final image)

### Performance Impact

| Build Type | Without Cache | With Cache | Speedup |
|------------|---------------|------------|---------|
| Fresh clone | 8 min | 8 min | 1x |
| No code changes | 8 min | 30 sec | 16x |
| Changed 1 file | 8 min | 2 min | 4x |

## Cloud Provider Mapping

### Architecture → Instance Type

Different cloud providers use different instance families for ARM:

```go
type ProviderInstanceMap struct {
    AMD64 map[string]string
    ARM64 map[string]string
}

var AWSInstances = ProviderInstanceMap{
    AMD64: map[string]string{
        "small":  "t3.small",
        "medium": "c5.xlarge",
        "large":  "c5.2xlarge",
    },
    ARM64: map[string]string{
        "small":  "t4g.small",
        "medium": "c6g.xlarge",
        "large":  "c6g.2xlarge",
    },
}

var DigitalOceanInstances = ProviderInstanceMap{
    AMD64: map[string]string{
        "small":  "s-2vcpu-4gb",
        "medium": "c-4",
        "large":  "c-8",
    },
    ARM64: map[string]string{
        // DigitalOcean doesn't offer ARM yet (as of 2025)
        // Fallback: Use AMD64 with QEMU emulation
        "small":  "s-2vcpu-4gb",
        "medium": "c-4",
        "large":  "c-8",
    },
}

func (p *CloudProvider) SelectInstance(size, arch string) string {
    if arch == "arm64" && !p.SupportsARM() {
        // Fallback: Use AMD64 with emulation warning
        log.Warn("Provider does not support ARM64, using AMD64 with QEMU")
        return p.InstanceMap.AMD64[size]
    }

    if arch == "arm64" {
        return p.InstanceMap.ARM64[size]
    }

    return p.InstanceMap.AMD64[size]
}
```

### Fallback Strategy (QEMU Emulation)

If a provider doesn't support ARM64 natively:

```bash
# Install QEMU on AMD64 VM
docker run --rm --privileged multiarch/qemu-user-static --reset -p yes

# Build ARM64 image on AMD64 host (slow but works)
docker buildx build --platform linux/arm64 ...
```

**Performance:**
- Native ARM64: 100% speed
- QEMU Emulation: 10-30% speed (10x slower)

**When to use:**
- Prototyping: QEMU is fine
- Production: Always use native builders

## Build Timeouts

To prevent runaway builds (e.g., infinite loops in Dockerfile):

```go
func (a *Agent) ExecuteBuild(msg BuildMessage) error {
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
    defer cancel()

    cmd := exec.CommandContext(ctx, "docker", "buildx", "build", ...)

    err := cmd.Run()
    if ctx.Err() == context.DeadlineExceeded {
        return fmt.Errorf("build timed out after 30 minutes")
    }

    return err
}
```

**Default Timeout:** 30 minutes

**Configurable via stagely.yaml:**

```yaml
builds:
  slow_service:
    context: "./heavy-app"
    timeout: "45m"
```

## Build Artifacts

After a successful build, the artifact URL is stored:

```sql
SELECT artifact_url FROM build_jobs WHERE id = 'job_123';
-- Result: registry.internal/proj-123/env-456:backend-amd64
```

This URL is passed to the Preview VM during the DEPLOY phase:

```json
{
  "type": "DEPLOY",
  "image": "registry.internal/proj-123/env-456:backend-amd64",
  ...
}
```

Preview VM pulls this image:

```bash
docker pull registry.internal/proj-123/env-456:backend-amd64
```

## Failure Handling

### Build Job Fails

If a build job fails (e.g., `RUN npm install` fails):

1. Agent sends STATUS: failed with error logs
2. Core marks build job as failed
3. Core checks: Are there other builds still running?
   - If yes: Wait for them to complete
   - If no: Mark workflow as failed
4. Core terminates all VMs for this workflow
5. Core posts GitHub comment: "❌ Build failed [View Logs]"

### Partial Success (Monorepo)

If `backend` builds successfully but `frontend` fails:

- Core marks workflow as failed
- Core does NOT provision Preview VM (incomplete build)
- User must fix frontend and push again

**Rationale:** We don't deploy partial environments (confusing and error-prone).

### Retry Strategy

Users can manually trigger a rebuild:

```http
POST /api/v1/environments/:env_id/rebuild
```

Core creates a new workflow run and re-executes from scratch.

## Build Queue Management

To limit costs, Core limits concurrent builds:

```go
type BuildQueue struct {
    MaxConcurrent int // e.g., 50
    Current       int
    Queue         []BuildJob
}

func (q *BuildQueue) Enqueue(job BuildJob) {
    if q.Current < q.MaxConcurrent {
        q.Current++
        go ProvisionBuilderVM(job)
    } else {
        q.Queue = append(q.Queue, job)
    }
}

func (q *BuildQueue) OnJobComplete(job BuildJob) {
    q.Current--
    if len(q.Queue) > 0 {
        next := q.Queue[0]
        q.Queue = q.Queue[1:]
        q.Enqueue(next)
    }
}
```

**Result:** If 100 PRs are opened simultaneously, only 50 builds run in parallel. The rest wait in queue.

## Observability

### Metrics

- Build queue depth (gauge)
- Build duration (histogram)
- Build success rate (counter)
- Cache hit rate (counter)

### Logs

All build logs are stored in database:

```sql
CREATE TABLE build_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_job_id UUID NOT NULL REFERENCES build_jobs(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stream VARCHAR(10) NOT NULL, -- 'stdout' or 'stderr'
    line TEXT NOT NULL
);

CREATE INDEX idx_build_logs_job ON build_logs(build_job_id, timestamp);
```

Users can view logs in real-time via WebSocket or replay them later.

## Cost Optimization Strategies

### 1. Golden Images

Pre-build VM images with common tools installed:

- Docker
- Git
- Node.js, Go, Python, etc.

**Savings:** Reduces build time by 1-2 minutes (no apt-get install).

### 2. Cache Warm-Up

For frequently-used projects, periodically rebuild cache layers:

```bash
# Nightly cron job
docker buildx build --cache-to=... --no-output .
```

**Savings:** First build of the day is fast.

### 3. Spot Instances

Use spot/preemptible VMs for builds (50-70% cost reduction):

```go
provider.CreateInstance(MachineSpec{
    Size:   "c5.xlarge",
    Spot:   true, // Use spot pricing
    MaxPrice: 0.05, // Max bid
})
```

**Risk:** VM can be terminated mid-build. Agent must handle gracefully and retry.

## Future Enhancements

1. **Build Matrix Testing**: Build multiple variants (Node 18, Node 20, Node 22) in parallel
2. **Custom Builders**: Allow users to provide their own Dockerfile for the build environment
3. **Build Artifact Caching**: Cache `node_modules`, Go vendor, etc. across builds
4. **Build Sharding**: Split large monorepo builds into sub-builds
5. **ARM64 Support Detection**: Auto-detect if provider supports ARM, skip if not
