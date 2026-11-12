-- Additive cleanup support. No existing records are deleted by this migration.
-- Refresh on a verification request so an old registration cannot be removed
-- between looking up its visitor and reserving a new email challenge.
ALTER TABLE visitors ADD COLUMN last_verification_requested_at INTEGER;
CREATE INDEX visitors_abandoned ON visitors(COALESCE(last_verification_requested_at,created_at)) WHERE email_verified_at IS NULL;
CREATE INDEX request_limits_expiry ON request_limits(expires_at);
CREATE INDEX auth_session_expiry ON auth_session(expires_at);
CREATE INDEX auth_verification_expiry ON auth_verification(expires_at);
CREATE INDEX auth_rate_limit_activity ON auth_rate_limit(last_request);
CREATE INDEX email_challenges_expiry ON email_challenges(expires_at);
-- Keep retention-reference checks from scanning growing history tables.
CREATE INDEX audit_events_actor ON audit_events(actor_id);
CREATE INDEX audit_events_subject ON audit_events(subject_id);
CREATE INDEX identity_attempts_visitor ON identity_attempts(visitor_id);
CREATE INDEX booking_cancellations_actor ON booking_cancellations(actor_id);
