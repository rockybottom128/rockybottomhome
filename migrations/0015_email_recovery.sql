-- Additive review metadata. Preserve delivery states so older code cannot retry
-- a reviewed uncertain send. No mail is queued and no existing data is changed.
ALTER TABLE email_outbox ADD COLUMN recovery_outcome TEXT CHECK(recovery_outcome IN ('accepted','not_accepted','unknown'));
ALTER TABLE email_outbox ADD COLUMN recovery_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE punch_report_deliveries ADD COLUMN recovery_outcome TEXT CHECK(recovery_outcome IN ('accepted','not_accepted','unknown'));
ALTER TABLE punch_report_deliveries ADD COLUMN recovery_revision INTEGER NOT NULL DEFAULT 0;
CREATE TABLE email_recovery_reviews (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('booking','report')),
 delivery_id TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES owner_accounts(id),
 outcome TEXT NOT NULL CHECK(outcome IN ('flagged','accepted','not_accepted','unknown')),
 evidence TEXT NOT NULL,
 provider_receipt TEXT NOT NULL,
 attempted_at INTEGER,
 previous_status TEXT NOT NULL,
 revision INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 request_key TEXT NOT NULL,
 request_signature TEXT NOT NULL,
 UNIQUE(actor_id,request_key),
 UNIQUE(kind,delivery_id,revision)
);
CREATE INDEX email_recovery_history ON email_recovery_reviews(kind,delivery_id,revision DESC);
