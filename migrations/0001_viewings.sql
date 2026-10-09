-- Scaffold only: not applied to Cloudflare. All timestamps are UTC epoch milliseconds.
PRAGMA foreign_keys = ON;
CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  email_verified_at INTEGER,
  display_name TEXT NOT NULL DEFAULT '',
  is_agent INTEGER NOT NULL DEFAULT 0 CHECK (is_agent IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE agent_credentials (
  visitor_id TEXT PRIMARY KEY REFERENCES visitors(id),
  licensed_name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  license_number TEXT NOT NULL,
  brokerage TEXT NOT NULL,
  business_contact TEXT NOT NULL,
  license_status TEXT NOT NULL DEFAULT 'pending' CHECK (license_status IN ('pending','active','inactive','unresolved')),
  contact_verified_at INTEGER,
  evidence_source TEXT,
  reviewed_by TEXT,
  review_valid_until INTEGER
);
CREATE TABLE identity_attempts (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  stripe_session_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending','verified','needs_retry','canceled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_pending_identity ON identity_attempts(visitor_id) WHERE status = 'pending';
CREATE TABLE reference_selfies (
  visitor_id TEXT PRIMARY KEY REFERENCES visitors(id),
  identity_attempt_id TEXT NOT NULL REFERENCES identity_attempts(id),
  private_object_key TEXT NOT NULL UNIQUE,
  consent_version TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  delete_after INTEGER NOT NULL
);
CREATE TABLE owner_accounts (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL UNIQUE,
  auth_subject TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('invited','active','removed')),
  created_at INTEGER NOT NULL
);
-- Password hashes, sessions and reset tokens belong to the selected auth library's schema.
CREATE TRIGGER preserve_last_owner_update BEFORE UPDATE OF status ON owner_accounts
WHEN OLD.status = 'active' AND NEW.status != 'active' AND (SELECT COUNT(*) FROM owner_accounts WHERE status = 'active') <= 1
BEGIN SELECT RAISE(ABORT, 'Cannot remove the last active owner'); END;
CREATE TRIGGER preserve_last_owner_delete BEFORE DELETE ON owner_accounts
WHEN OLD.status = 'active' AND (SELECT COUNT(*) FROM owner_accounts WHERE status = 'active') <= 1
BEGIN SELECT RAISE(ABORT, 'Cannot remove the last active owner'); END;
CREATE TABLE availability_slots (
  id TEXT PRIMARY KEY,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
  mode TEXT NOT NULL CHECK (mode IN ('owner_coordinated','agent_private')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1))
);
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  slot_id TEXT NOT NULL REFERENCES availability_slots(id),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK (ends_at > starts_at),
  mode TEXT NOT NULL CHECK (mode IN ('owner_coordinated','agent_private')),
  source TEXT NOT NULL CHECK (source IN ('public','mls')),
  referral_verified INTEGER NOT NULL DEFAULT 0 CHECK (referral_verified IN (0,1)),
  agent_attending INTEGER NOT NULL DEFAULT 0 CHECK (agent_attending IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('requested','approved','canceled','completed')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL
);
CREATE INDEX bookings_by_visitor ON bookings(visitor_id, starts_at);
CREATE INDEX bookings_by_time ON bookings(starts_at, ends_at, status);
CREATE TRIGGER prevent_overlap_insert BEFORE INSERT ON bookings
WHEN NEW.status IN ('requested','approved') AND EXISTS (
 SELECT 1 FROM bookings WHERE status IN ('requested','approved') AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at
)
BEGIN SELECT RAISE(ABORT, 'Viewing overlaps an existing reservation'); END;
CREATE TRIGGER prevent_overlap_update BEFORE UPDATE ON bookings
WHEN NEW.status IN ('requested','approved') AND EXISTS (
 SELECT 1 FROM bookings WHERE id != NEW.id AND status IN ('requested','approved') AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at
)
BEGIN SELECT RAISE(ABORT, 'Viewing overlaps an existing reservation'); END;
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('question','feedback','reply')),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at INTEGER NOT NULL
);
CREATE TABLE access_jobs (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  booking_revision INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  provider_job_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','installed','sent','revoking','revoked','failed','canceled')),
  UNIQUE(booking_id, booking_revision)
);
-- Never store plaintext access codes in messages or audit records.
CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id),
  booking_revision INTEGER,
  kind TEXT NOT NULL CHECK (kind IN ('confirmation','access','followup','owner_alert')),
  deduplication_key TEXT NOT NULL UNIQUE,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sending','sent','failed','canceled','uncertain')),
  provider_message_id TEXT
);
CREATE TABLE provider_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, processed_at INTEGER NOT NULL);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
