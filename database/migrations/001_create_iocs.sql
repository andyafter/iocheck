CREATE TABLE IF NOT EXISTS iocs (
  type TEXT NOT NULL CHECK (type IN ('ip', 'domain', 'sha256')),
  value TEXT NOT NULL,
  source TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (type, value)
);
