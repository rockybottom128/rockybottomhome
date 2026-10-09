-- Scaffold only. Apply after 0001; no live resources are configured.
-- One challenge per visitor. Resend atomically replaces its digest and generation.
-- Use a keyed digest of visitor + generation + code, never a plaintext eight-digit code.
CREATE TABLE email_challenges (
  visitor_id TEXT PRIMARY KEY REFERENCES visitors(id),
  generation TEXT NOT NULL UNIQUE,
  code_digest TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  consumed_at INTEGER,
  last_sent_at INTEGER NOT NULL
);
CREATE TABLE visitor_sessions (
  token_digest TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
-- Local recurring times interpreted in America/New_York; no overnight ranges.
CREATE TABLE availability_block_rules (
  id TEXT PRIMARY KEY,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN -1 AND 6),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute),
  created_by TEXT NOT NULL REFERENCES owner_accounts(id)
);
-- Whole-day block wins; slot exceptions override recurring defaults.
CREATE TABLE availability_exceptions (
  local_day TEXT NOT NULL,
  slot_start_minute INTEGER NOT NULL CHECK (slot_start_minute BETWEEN -1 AND 1439),
  blocked INTEGER NOT NULL CHECK (blocked IN (0,1)),
  changed_by TEXT NOT NULL REFERENCES owner_accounts(id),
  PRIMARY KEY(local_day, slot_start_minute)
);
CREATE TABLE booking_cancellations (
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  booking_revision INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 5 AND 1000),
  notification_authorized INTEGER NOT NULL CHECK (notification_authorized = 1),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(booking_id, booking_revision)
);
-- Cancellation and an outbox row are committed with the availability change.
-- Existing outbox kind 'confirmation' can carry approval or cancellation status.
ALTER TABLE email_outbox ADD COLUMN payload_json TEXT;
-- Store only safe notification details here, never PINs or verification codes.
ALTER TABLE access_jobs ADD COLUMN secret_reference TEXT;
-- PIN ciphertext/secret belongs in protected server storage, scoped to booking revision.
-- Remove duplicated agent business email; verified visitors.email_normalized is authoritative.
ALTER TABLE agent_credentials DROP COLUMN business_contact;
