-- Additive. Runtime imports this environment's existing allowlist exactly once.
-- Private email values never appear in migration source. No account/session reset.
CREATE TABLE visitor_allowlist_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 initialized INTEGER NOT NULL DEFAULT 0 CHECK(initialized IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 mutation_id TEXT
);
INSERT INTO visitor_allowlist_state(id) VALUES(1);
CREATE TABLE visitor_allowlist_entries (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('domain','email')),
 value TEXT NOT NULL,
 UNIQUE(kind,value)
);
CREATE TABLE visitor_allowlist_audit (
 revision INTEGER PRIMARY KEY,
 actor_id TEXT REFERENCES owner_accounts(id),
 action TEXT NOT NULL CHECK(action IN ('import','add','update','remove')),
 before_json TEXT,
 after_json TEXT,
 created_at INTEGER NOT NULL
);
