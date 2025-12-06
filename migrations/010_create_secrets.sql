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
