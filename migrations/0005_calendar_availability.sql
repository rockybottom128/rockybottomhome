-- Additive: deliberately do not import legacy scaffold rows or browser examples.
-- Empty calendar means no visitor availability. Epoch timestamps are milliseconds.
CREATE TABLE calendar_state (
 id INTEGER PRIMARY KEY CHECK(id=1),
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
 mutation_id TEXT,
 updated_by TEXT REFERENCES owner_accounts(id),
 updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO calendar_state(id) VALUES(1);
CREATE TABLE calendar_periods (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('available','blocked')),
 local_day TEXT,
 weekday INTEGER,
 start_minute INTEGER NOT NULL CHECK(start_minute>=0 AND start_minute<1440 AND start_minute%15=0),
 end_minute INTEGER NOT NULL CHECK(end_minute>start_minute AND end_minute<=1440 AND end_minute%15=0),
 CHECK((local_day IS NOT NULL AND weekday IS NULL) OR (local_day IS NULL AND weekday BETWEEN -1 AND 6 AND weekday IS NOT NULL))
);
CREATE TABLE calendar_audit (
 revision INTEGER PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES owner_accounts(id),
 period_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('add','update','remove')),
 before_json TEXT,
 after_json TEXT,
 created_at INTEGER NOT NULL
);
