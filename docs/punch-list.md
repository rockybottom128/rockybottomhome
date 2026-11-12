# Owner punch list

A simple shared owner to-do list. Any active owner can add an item name (1–120 characters), rename it directly in the table, mark it completed, or reopen it. No description, category, claim, or assignment is required. Editing works on open and completed items; Save and Cancel icons have accessible labels, Enter saves, and Escape cancels.

The table shows Status, Item name, Created, and Completed. Open items use a green filled circle; completed items use a red checkmark. Created and completed cells display the date and responsible owner's email; full timestamps remain stored for sorting. The dashboard counter shows all open items and links to the punch list section, updating after list changes. Reopening clears the current completion timestamp and completing owner. Click a heading to sort the entire result set; click it again to reverse the direction. Newest-created items appear first by default. The Include completed items switch is off initially. There are no other filters. Results are paginated 50 at a time, with page controls shown only when needed. Dates use the device's time zone. Refresh retrieves changes from other owners.

All reads and writes require an active-owner session. Existing same-origin and JSON protections apply. Revision checks reject stale edits and competing status changes. Client identifiers prevent duplicate creation on retries. No mail is sent.

Item names must be a single printable line. Create, edit, and bulk entry reject tabs, control characters, and Unicode line/paragraph separators before trimming; bulk CR/LF separators still delimit separate items. Invalid fields, identifiers, revisions, sort options, and report input return HTTP 400. Valid but stale revisions and duplicate-confirmation conflicts remain HTTP 409. A rejected bulk submission saves no items.

## Migration and local verification

Migration 0011 is retained because it was already applied to the local preview. Migration 0012 copies those records into the simplified `punch_tasks` table, preserving names, creators, dates, completion attribution, and revisions. Previously claimed unfinished items become ordinary open items. The original `punch_items` and `punch_categories` tables remain as an unused legacy snapshot, preserving retired descriptions/categories rather than deleting user data. New writes only affect `punch_tasks`; do not roll back to the first preview's code, which would show that stale legacy snapshot.

Apply pending migrations locally with `npm run db:migrate:local`, build with `npm run build:auth-local`, and restart the local authenticated preview on port 4324 with its existing settings and persistent database. Do not reset accounts or test data. Run `npm run test:punch-list`, TypeScript, security, and version checks. Tests use disposable databases and cover record migration, owner permissions, stale updates, removed functionality, global sorting, pagination, and the completed-items switch.

Shared development publication requires an approved batch. Production migration is a separately reviewed action; apply through 0012 before deploying this code. This document does not authorize remote changes.

## Dashboard batch: bulk entry and report email

The punch list starts collapsed. Its summary tile and Jump to menu expand it. The
menu groups Messages & showings, Email, and System. The dashboard automation
sample is removed; the separate demo page remains unchanged. Service status
separates a working login/database request from configured (not delivery-tested)
mail. Analytics are explicitly unavailable until authorized Cloudflare access
and dataset configuration are verified.

Multiple-entry mode accepts CRLF, LF or CR separated names, trims each line and
ignores blank lines. It warns about repeated names before saving. The existing
120-character limit applies to each name; at most 100 nonblank lines are saved
in one atomic transaction. A stored request identity prevents duplicate retries;
a changed payload under that identity is rejected. Duplicate checks compare NFKC-normalized, case-insensitive names with collapsed whitespace, both within the paste and against existing open/completed tasks. The entire batch is rejected with line numbers until edited or the sender explicitly checks the duplicate override. The override keeps every line; no existing tasks are removed. Successful request retries are recognized before duplicate checks. Single entry remains available.

Report preparation snapshots all matching items in the current global sort,
independent of pagination. It records the browser time zone and snapshot time.
More than 2,000 matching items is rejected rather than silently truncated. Up to
10 distinct recipients can be selected from active/invited owners or typed as
custom addresses. Custom addresses never receive creator/completer email
attribution; this also wins when the same address is both selected and typed.
Listed owners receive attribution, including invited owners. No accounts or
visitor email rules are created or altered. Owner status is checked again before
sending to a listed owner. All report actions require an active sender.

The report preview is immutable. Each recipient gets a separate escaped HTML
report plus plain text, through the existing sender/reply-to configuration.
Plain-text report cells collapse legacy whitespace/control characters and render
literal pipes as `¦`, so stored labels cannot forge additional rows or columns.
Stored snapshots remain unchanged, and HTML continues to escape original values.
Report history distinguishes provider acceptance from inbox delivery. Only
pending or preflight-failed deliveries can be retried by the original sender;
sending/uncertain outcomes require provider investigation. Partial success is
shown per recipient. The separate report budget and recipient limits also apply, plus a
20-actions-per-owner/hour report limit. Prepared but unsent reports remain in
history. There is no automatic sending worker or retention cleanup in this batch.

Migration 0013 adds batch identities, report snapshots and recipient delivery
records, without modifying existing rows. Apply locally before the updated
preview, preserving the persistent database. Remote migration/publication remains
separately authorized. Reports contain private task data: keep backups private
and establish a retention policy before wider use.

Tests use disposable SQLite/D1 fixtures and local fake mail. The authenticated
integration suite covers same-origin and owner gates, a 55-item report and
idempotent sending without contacting Resend. Do not run real-mail report tests
without explicit recipient/send authorization.

## Local review corrections

The visibility switch says Show punch list or Hide punch list and exposes its
state to assistive technology. Activity is last in System and in its jump-menu
group. Entry failures appear immediately below the input, retain the draft and
receive focus. List refresh does not erase that entry feedback.

Capability checks detect absent migration-0013 tables without changing the
database. Bulk submission and report preview are disabled with an explicit
approval/update message until those tables exist; single-item actions remain
available. Authenticated APIs also reject blocked actions before rate-limit
writes and return an actionable setup error. Report history shows the same
reason rather than a generic failure. This does not apply the migration.

Report delivery mode is shown before sending. In local test mode the action is
labelled Save local test report (no email), and results/history say Saved locally
in test mode — NO email sent. Historical labels use each delivery's saved
local-test receipt, not the current configuration. Real provider acceptance
remains explicitly unconfirmed inbox delivery. Send requests confirm the mode
shown to the owner; a changed mode requires review before sending. No mail
configuration was changed by this correction.
