-- Additive: retain all existing tasks, accounts and settings.
CREATE TABLE punch_batches(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES owner_accounts(id), payload TEXT NOT NULL);
CREATE TABLE punch_reports(id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES owner_accounts(id), created_at INTEGER NOT NULL, options_json TEXT NOT NULL, items_json TEXT NOT NULL);
CREATE TABLE punch_report_deliveries(
 id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES punch_reports(id), recipient TEXT NOT NULL,
 owner_id TEXT REFERENCES owner_accounts(id), include_attribution INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','uncertain')),
 attempted_at INTEGER, sent_at INTEGER, provider_id TEXT,
 UNIQUE(report_id,recipient)
);
