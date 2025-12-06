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
