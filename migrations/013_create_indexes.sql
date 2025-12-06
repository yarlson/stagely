-- Additional composite indexes for performance-critical queries

-- Fast lookup: "Find active environments for this project"
CREATE INDEX IF NOT EXISTS idx_environments_project_status
ON environments(project_id, status)
WHERE status IN ('ready', 'deploying');

-- Fast lookup: "Find all build jobs waiting in queue"
CREATE INDEX IF NOT EXISTS idx_build_jobs_status_queued
ON build_jobs(status, queued_at)
WHERE status = 'queued';

-- Fast lookup: "Find environments by PR number (not terminated)"
CREATE INDEX IF NOT EXISTS idx_environments_pr_lookup
ON environments(project_id, pr_number)
WHERE terminated_at IS NULL;

-- Fast lookup: "Find team members for authorization checks"
CREATE INDEX IF NOT EXISTS idx_team_members_composite
ON team_members(user_id, team_id, role);

-- Fast lookup: "Find recent audit logs for a team"
CREATE INDEX IF NOT EXISTS idx_audit_logs_team_time
ON audit_logs(team_id, timestamp DESC);
