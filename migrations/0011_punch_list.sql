CREATE TABLE punch_categories (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 60),
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO punch_categories(id,name) VALUES ('general','General');
CREATE TABLE punch_items (
 id TEXT PRIMARY KEY,
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 description TEXT NOT NULL CHECK(length(description)<=4000),
 category_id TEXT NOT NULL REFERENCES punch_categories(id),
 creator_id TEXT NOT NULL REFERENCES owner_accounts(id),
 claimed_by TEXT REFERENCES owner_accounts(id),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 completed_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 1,
 CHECK(completed_at IS NULL OR claimed_by IS NOT NULL)
);
CREATE INDEX punch_created ON punch_items(created_at DESC,id);
CREATE INDEX punch_claimed ON punch_items(claimed_by,completed_at);
CREATE INDEX punch_category ON punch_items(category_id);
