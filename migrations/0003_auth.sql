-- Authentication for the dedicated development database. Never apply to production implicitly.
CREATE TABLE auth_user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE auth_session (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE);
CREATE INDEX auth_session_user ON auth_session(user_id);
CREATE TABLE auth_account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX auth_account_provider ON auth_account(provider_id, account_id);
CREATE TABLE auth_verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX auth_verification_identifier ON auth_verification(identifier);
CREATE TABLE auth_rate_limit (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, last_request INTEGER NOT NULL);
CREATE TABLE request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
ALTER TABLE email_challenges ADD COLUMN delivery TEXT NOT NULL DEFAULT 'pending' CHECK(delivery IN ('pending','sent','failed'));
ALTER TABLE visitor_sessions ADD COLUMN challenge_generation TEXT;
CREATE UNIQUE INDEX visitor_session_challenge ON visitor_sessions(challenge_generation);
CREATE INDEX visitor_sessions_expiry ON visitor_sessions(expires_at);
-- Only populated in explicit loopback-only test mode; never used for real Gmail mail.
CREATE TABLE local_test_mail (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE setup_claims (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
