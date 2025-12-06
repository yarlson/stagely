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
