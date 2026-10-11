-- Additive only: preserve accounts, bookings, availability and existing mail.
-- New booking notifications are committed with their originating action.
ALTER TABLE email_outbox ADD COLUMN created_at INTEGER;
ALTER TABLE email_outbox ADD COLUMN attempted_at INTEGER;
ALTER TABLE email_outbox ADD COLUMN sent_at INTEGER;
ALTER TABLE email_outbox ADD COLUMN actor_id TEXT;
CREATE INDEX email_outbox_booking_history ON email_outbox(booking_id, created_at);
CREATE INDEX bookings_owner_calendar ON bookings(starts_at, status);
