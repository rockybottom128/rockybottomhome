-- Additive on-site inbox. Legacy messages and booking email history remain intact.
CREATE TABLE conversation_threads (
 id TEXT PRIMARY KEY,
 visitor_id TEXT NOT NULL REFERENCES visitors(id),
 booking_id TEXT REFERENCES bookings(id),
 subject TEXT NOT NULL CHECK(length(subject) BETWEEN 1 AND 120),
 status TEXT NOT NULL CHECK(status IN ('needs_owner','waiting_visitor','resolved','external')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 creator_role TEXT NOT NULL CHECK(creator_role IN ('owner','visitor')),
 creator_id TEXT NOT NULL,
 request_key TEXT NOT NULL,
 UNIQUE(creator_role,creator_id,request_key)
);
CREATE INDEX conversation_visitor ON conversation_threads(visitor_id,updated_at DESC);
CREATE INDEX conversation_attention ON conversation_threads(status,updated_at DESC);
CREATE TABLE conversation_entries (
 id TEXT PRIMARY KEY,
 thread_id TEXT NOT NULL REFERENCES conversation_threads(id),
 actor_role TEXT NOT NULL CHECK(actor_role IN ('owner','visitor')),
 actor_id TEXT NOT NULL,
 actor_label TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('message','resolved','external')),
 body TEXT NOT NULL CHECK(length(body)<=2000),
 created_at INTEGER NOT NULL,
 thread_revision INTEGER NOT NULL,
 request_key TEXT NOT NULL,
 request_signature TEXT NOT NULL,
 UNIQUE(actor_role,actor_id,request_key),
 UNIQUE(thread_id,thread_revision)
);
CREATE INDEX conversation_history ON conversation_entries(thread_id,thread_revision);
