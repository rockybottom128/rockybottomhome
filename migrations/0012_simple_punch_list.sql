-- Preserve the first preview's records, including retired fields, in the old tables.
-- New functionality uses only this simplified table; no claim is required.
CREATE TABLE punch_tasks (
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 creator_id TEXT NOT NULL REFERENCES owner_accounts(id),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 completed_at INTEGER,
 completed_by TEXT REFERENCES owner_accounts(id),
 revision INTEGER NOT NULL DEFAULT 1,
 CHECK((completed_at IS NULL AND completed_by IS NULL) OR (completed_at IS NOT NULL AND completed_by IS NOT NULL))
);
INSERT INTO punch_tasks(id,label,creator_id,created_at,updated_at,completed_at,completed_by,revision)
 SELECT id,label,creator_id,created_at,updated_at,completed_at,
 CASE WHEN completed_at IS NOT NULL THEN claimed_by ELSE NULL END,revision FROM punch_items;
CREATE INDEX punch_tasks_created ON punch_tasks(created_at DESC,id);
CREATE INDEX punch_tasks_completed ON punch_tasks(completed_at,id);
