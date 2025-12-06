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
