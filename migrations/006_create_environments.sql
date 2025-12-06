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
