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
