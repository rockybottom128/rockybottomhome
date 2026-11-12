# Website conversations — 0.4.1.0 development candidate

Owner-requested update within the 0.4 release family. Branch `rockyadmin/visitor-messaging`. The owner authorized committing and publishing this reviewed batch to shared dev on October 11, 2026. Production promotion remains separately authorized.

## Behavior

- The owner dashboard has a shared Messages block. Visitor rows group independent subject threads. The top counter counts threads needing an owner reply, not unread messages or distinct visitors. Reading does not clear attention.
- Verified visitors with at least one requested or approved booking that ends in the future or ended less than 30 days ago can start topics. The cutoff is exclusive at exactly 30 elapsed days (30 × 24 hours); canceled bookings do not qualify. Eligibility is checked again inside the create transaction. Any active owner can start a topic with the same eligible visitors, including visitors with no prior conversation. The request must exist; verification alone is insufficient.
- Either side can reply to existing threads after all bookings are completed or canceled. History is retained. Existing visitor sign-in, email policy and the visitor enable switch continue to apply; paused visitor access blocks the visitor inbox as well.
- Visitor messages set `needs_owner`; owner messages set `waiting_visitor`. Owners can record `resolved` or `external`. Any subsequent reply reopens a thread with the appropriate attention status. A closed thread cannot be closed again or switched to the other closure state until a new message reopens it; the server enforces this as well as the UI. Closure controls sit below the reply form and are disabled while a draft is present. Sending a reply already clears owner attention; closure is a separate action for when no reply is needed.
- Owner messages are attributed to the actual owner in the owner inbox. Visitors see “Owner”; personal owner email addresses are not returned in visitor message histories. All active owners share permissions. Removal immediately prevents access.
- Replies use the last viewed revision. A competing reply or resolution causes a conflict instead of silently clearing newer attention. Refresh loads the new history and retains the draft in the current tab. Drafts are not saved across reloads or sign-out.
- Retry keys prevent duplicate saved sends. Plain text only, 120-character subjects and 2,000-character message bodies. No attachments, rich HTML, editing or deletion.
- Refresh messages is explicit. No background polling or real-time delivery yet. Conversation entries provide author/time/status history and appear in the general activity block without message bodies.
- Messaging does not enqueue or send notification emails. The UI explicitly states this. Existing booking approval/cancellation emails and their delivery issues/history remain separate. The old direct-email compose control is replaced with a link to website messages; the legacy booking-mail API remains for compatibility.
- Future notifications should link back to `/viewings/messages/` or `/owner/dashboard/#messages`, use a separate durable notification outbox, and deduplicate delivery independently of saved messages. External email replies are not imported.

## Schema and deployment

`0010_conversations.sql` adds `conversation_threads`, `conversation_entries` and indexes. No existing table, account, request or email record is modified, imported or deleted. Entries and thread changes commit in one D1 batch; write-time eligibility/permissions, revision conditions and unique constraints protect races and retries. Optional booking links are validated to belong to the thread visitor; the initial general inbox composer is visitor-based.

Apply migration 0010 before starting this code against a database. It has been applied only to local preview storage. Before separately authorized production promotion, take/verify a production recovery point, review the additive SQL and apply it under the existing release procedure. Old code ignores the new tables; rolling back code hides conversations but retains their records. Do not drop them to roll back. The authorized shared-dev publication uses the established dev command, which applies pending migrations to the dev database before deploying.

## Local review

- Existing authenticated preview: `http://127.0.0.1:4324/owner/dashboard/#messages` and `http://127.0.0.1:4324/viewings/messages/`.
- No-sign-in sample: `http://127.0.0.1:4324/message-preview/`. It is loopback-only, uses fictional browser memory, sends no requests to the message API and resets on reload. Switch between owner and visitor views to try both sides. It returns 404 for non-loopback hosts or a configured remote origin.
- `npm run test:messages`: SQLite coverage for threads, attention, isolation, eligibility, removed owners, retry/collision handling, competing replies, resolution/reopening and retained histories.
- `npm run test:auth:isolated`: disposable Worker/database with fake mail exercises authentication, CSRF, message routes, shared dashboard counter, visitor history redaction and the pause switch alongside existing booking flows.

## Messaging remediation — 0.6.6.0 local candidate

Inbox responses load up to 200 threads, eligible recipient responses up to 100 visitors, and histories up to 100 entries. Explicit load-more controls retain access to older data. Stable cursors break timestamp ties with thread IDs; recipient cursors use email and ID; history uses immutable thread revisions. Every page repeats authorization and visitor isolation. History first shows the latest entries in chronological order; loading earlier messages does not advance the viewed revision, clear a draft, or silently accept a competing reply. Visitor responses continue to redact owner email labels.

The dashboard counter covers all threads needing an owner reply, including unloaded pages. Visitor-group badges and search/needs-reply filters describe loaded threads only. Refresh returns to the newest page and retains current-tab drafts. If a selected new-topic recipient is no longer on the loaded page, the composer requires a fresh recipient choice instead of silently switching to the first visitor. Threads updated during paging can move into an already-read range; refresh the inbox for current ordering. No records are deleted by these limits. Existing conversations remain readable and repliable after the new-topic eligibility window expires or bookings are canceled, subject to the existing sign-in/access controls. Replaying an already-saved create request remains idempotent after expiry.

No migration or infrastructure change is required. Automatic notifications, retention policy, attachments and server-side search remain future work. Tests cover cutoff boundaries, transaction-time eligibility, tied ordering across pages, complete counts, older history, malformed cursors, privacy and authenticated routes.
