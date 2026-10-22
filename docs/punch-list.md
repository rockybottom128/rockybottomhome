# Owner punch list

A simple shared owner to-do list. Any active owner can add an item name (1–120 characters), rename it directly in the table, mark it completed, or reopen it. No description, category, claim, or assignment is required. Editing works on open and completed items; Save and Cancel icons have accessible labels, Enter saves, and Escape cancels.

The table shows Status, Item name, Created, and Completed. Open items use a green filled circle; completed items use a red checkmark. Created and completed cells display the date and responsible owner's email; full timestamps remain stored for sorting. The dashboard counter shows all open items and links to the punch list section, updating after list changes. Reopening clears the current completion timestamp and completing owner. Click a heading to sort the entire result set; click it again to reverse the direction. Newest-created items appear first by default. The Include completed items switch is off initially. There are no other filters. Results are paginated 50 at a time, with page controls shown only when needed. Dates use the device's time zone. Refresh retrieves changes from other owners.

All reads and writes require an active-owner session. Existing same-origin and JSON protections apply. Revision checks reject stale edits and competing status changes. Client identifiers prevent duplicate creation on retries. No mail is sent.

## Migration and local verification

Migration 0011 is retained because it was already applied to the local preview. Migration 0012 copies those records into the simplified `punch_tasks` table, preserving names, creators, dates, completion attribution, and revisions. Previously claimed unfinished items become ordinary open items. The original `punch_items` and `punch_categories` tables remain as an unused legacy snapshot, preserving retired descriptions/categories rather than deleting user data. New writes only affect `punch_tasks`; do not roll back to the first preview's code, which would show that stale legacy snapshot.

Apply pending migrations locally with `npm run db:migrate:local`, build with `npm run build:auth-local`, and restart the local authenticated preview on port 4324 with its existing settings and persistent database. Do not reset accounts or test data. Run `npm run test:punch-list`, TypeScript, security, and version checks. Tests use disposable databases and cover record migration, owner permissions, stale updates, removed functionality, global sorting, pagination, and the completed-items switch.

Shared development publication requires an approved batch. Production migration is a separately reviewed action; apply through 0012 before deploying this code. This document does not authorize remote changes.
