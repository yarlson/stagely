-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,

    -- Git
    repo_url TEXT NOT NULL,
    repo_provider VARCHAR(50) NOT NULL DEFAULT 'github',
    default_branch VARCHAR(100) DEFAULT 'main',

    -- Cloud
    cloud_provider_id UUID,
    default_preview_size VARCHAR(20) DEFAULT 'medium',

    -- Configuration
    config JSONB DEFAULT '{}',

    -- Status
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_project_slug UNIQUE(team_id, slug),
    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
    CONSTRAINT valid_provider CHECK (repo_provider IN ('github', 'gitlab', 'bitbucket')),
    CONSTRAINT valid_size CHECK (default_preview_size IN ('small', 'medium', 'large', 'xlarge'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(team_id, slug);
CREATE INDEX IF NOT EXISTS idx_projects_repo ON projects(repo_url);

-- Comments
COMMENT ON TABLE projects IS 'Git repositories configured for preview environments';
COMMENT ON COLUMN projects.config IS 'Project-specific settings (JSON)';
