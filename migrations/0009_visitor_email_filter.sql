-- Additive: retain existing allow entries and restrictive default.
ALTER TABLE visitor_allowlist_state ADD COLUMN global_filter INTEGER NOT NULL DEFAULT 1 CHECK(global_filter IN (0,1));
CREATE TABLE visitor_blocklist_entries (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('domain','email')),
 value TEXT NOT NULL,
 UNIQUE(kind,value)
);
-- All policy edits share the existing revision and owner audit transaction.
