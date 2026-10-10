CREATE TABLE site_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL CHECK(value IN ('on','off')),
 updated_at INTEGER NOT NULL,
 updated_by TEXT REFERENCES owner_accounts(id)
);
INSERT INTO site_settings(key,value,updated_at) VALUES ('visitor_demo','off',0);
