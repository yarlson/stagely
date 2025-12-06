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
