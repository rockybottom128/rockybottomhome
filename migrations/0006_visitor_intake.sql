-- Visitor-provided information. Validation is explicitly simulated, never a real
-- license/contact/identity verification result. Existing records stay untouched.
CREATE TABLE visitor_intake_profiles (
 visitor_id TEXT PRIMARY KEY REFERENCES visitors(id),
 role TEXT NOT NULL CHECK(role IN ('buyer','agent')),
 display_name TEXT NOT NULL,
 licensed_name TEXT NOT NULL DEFAULT '',
 jurisdiction TEXT NOT NULL DEFAULT '',
 license_number TEXT NOT NULL DEFAULT '',
 brokerage TEXT NOT NULL DEFAULT '',
 validation_status TEXT NOT NULL CHECK(validation_status='simulated_pass'),
 revision INTEGER NOT NULL CHECK(revision>0),
 updated_at INTEGER NOT NULL
);
-- Existing booking scaffold remains compatible; old records are not relabeled
-- as verified. New requests keep an immutable profile snapshot and retry key.
ALTER TABLE bookings ADD COLUMN request_key TEXT;
ALTER TABLE bookings ADD COLUMN profile_snapshot TEXT;
ALTER TABLE bookings ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'unverified'
 CHECK(validation_status IN ('unverified','simulated_pass'));
ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX booking_request_retry ON bookings(visitor_id,request_key) WHERE request_key IS NOT NULL;
