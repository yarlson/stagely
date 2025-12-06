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
