-- Create build_logs table
CREATE TABLE IF NOT EXISTS build_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    build_job_id UUID NOT NULL REFERENCES build_jobs(id) ON DELETE CASCADE,

    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stream VARCHAR(10) NOT NULL,
    line TEXT NOT NULL,

    CONSTRAINT valid_stream CHECK (stream IN ('stdout', 'stderr'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_build_logs_job ON build_logs(build_job_id, timestamp);

-- Comments
COMMENT ON TABLE build_logs IS 'Real-time build output (streamed via Agent WebSocket)';
