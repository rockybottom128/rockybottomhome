# Shared calendar availability

Source candidate: prelaunch 0.4.0.0. Owner availability, visitor profiles, viewing requests, approvals and cancellations are real persistent data. Identity/agent validation and the separate sample dashboard remain simulated. Showing or selecting a slot does not reserve it; submitting a request holds it pending owner approval. Booking emails and lockbox/access jobs are not created. See [visitor booking](visitor-booking.md).

## Data model and migration review

Migration 0005 is additive. `calendar_periods` contains either a weekly rule (`weekday=-1` for every day or 0–6 for Sunday–Saturday) or a dated exception (`local_day`, ISO date). Both types may be available or blocked, with start/end minutes on quarter-hour boundaries. There are no owner notes in this model. `calendar_state` holds one global revision, last actor/time and an internal mutation identifier. `calendar_audit` preserves actor, action, period ID and before/after values at each successful revision. Audit history is private and is not returned by the visitor endpoint.

The starting state is empty: no visitor availability until an owner explicitly adds an available period. Neither localStorage nor the legacy `availability_block_rules` or `availability_exceptions` tables feed the calendar. `availability_slots` now stores the concrete UTC slot associated with each real request; it is not the source of open availability. This avoids importing fictional examples or adopting their older precedence rules.

## Calculation policy

- Property wall time is always America/New_York, independent of the viewer's device zone. Supported dates are 2000–2099; visitor queries cover today through 41 days ahead, at most 42 days. The existing rolling four/five-week calendar remains.
- Available periods are combined. Blocks are combined and always win, including a partial overlap and any dated or recurring block. Dated availability does not override a block. Removing a block restores only time covered by available periods.
- Intervals include their start and exclude their end. End must be after start, within the same local day; 24:00 is allowed only as the end. Overnight ranges must be split across the two dates or weekdays. Invalid dates, weekdays and non-quarter-hour boundaries are rejected.
- One-hour visitor slots begin on clock hours (the previous UI's cadence), now across any configured hours rather than an implicit 9–5 default. All four quarters must be covered by available time and no blocked time. Adjacent available ranges can together cover a slot. Duplicate/overlapping ranges never duplicate slots.
- Slots must start in the future. Each quarter-hour boundary must resolve to exactly one Eastern instant, and adjacent boundaries must be 15 elapsed minutes apart. Nonexistent spring-forward and repeated fall-back times are excluded, as are slots touching those ambiguous boundaries. This conservative policy avoids silently shifting a requested time or selecting one of two repeated times. Ordinary summer/winter slots use the correct UTC offset; 24:00 resolves on the next local date.
- Real pending and approved requests exclude overlapping slots from both owner and visitor availability. Booking writes advance the shared calendar revision. Calendar edits that would invalidate a held request are rejected; first cancel the request explicitly from the dashboard. Legacy browser examples never reduce availability or get imported into real bookings.

## Authentication, concurrency and error behavior

`GET /api/owner/availability` returns the shared revision and periods to active owners, optionally with server-calculated slots for a selected day. `POST` uses the existing exact-origin, bounded JSON and session checks. It accepts one add/update/remove operation and the revision the owner viewed. SQL also rechecks active-owner status at mutation time.

A D1 transactional batch advances the revision conditionally, writes the audit snapshot, and modifies the period. A unique internal token gates all statements. A stale revision, missing period, removed owner or 500-period limit prevents the entire logical change. SQL failures roll back the batch. Two concurrent edits at one revision have one winner. A replay with the old revision cannot add a duplicate. UI controls disable during save; errors require reload and review before retrying. No automatic overwrite or retry follows an uncertain response. The list offers edit/remove; the day view offers full-day and individual available-slot blocks. Removing individual blocks is available in the saved settings list.

`GET /api/visitor/availability` requires a current verified visitor session and the enabled visitor-demo switch. It returns only the time zone and available slots (local day/times and UTC instants), with no owner identities, raw rules or audit records. All responses are no-store. Owners can manage availability while the visitor switch is off. Load failures show an error and no selectable slots; submission rechecks access, availability and saved profile, then atomically holds the slot. Existing email verification and owner authentication are unchanged.

## Verification and rollout

Run `npm run test:availability` for calculations, DST, validation, persistence through a reopened database, blocked-slot exclusion, concurrency and audit rollback. Run `npm run test:auth:isolated` for actual local Worker/D1 authorization, two independent owner sessions, origin checks, visitor filtering, demo-off behavior and existing login/verification regression coverage. The isolated test uses temporary local state and fake mail and never connects to the live databases. These do not establish cross-device or deployment persistence remotely; perform that acceptance check after authorized shared-dev publication.

Production preparation requires a separately reviewed backup/recovery point and compatibility plan; see the environment runbook. Migration 0005 preserves old schema/data, and old code remains schema-compatible. It will not display the new shared calendar after rollback. Do not interpret code rollback as data rollback. Do not reset a database to apply the migration.

D1 batch transaction behavior: [Cloudflare D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Dashboard activity

Availability and saved Activity appear above the sample workflow. The owner-only dashboard shows the latest 50 events from `calendar_audit` and `audit_events`, newest first, with actor, Eastern timestamp and calendar before/after descriptions. Older events remain in D1. Reload the dashboard to see new changes. Existing calendar edits, invitations/removals and visitor-demo changes are shown immediately; successful visitor email verification and owner password setup/reset are logged from this update onward. Historical events that were never logged cannot be reconstructed. Passwords, reset links, OTPs, session tokens and email bodies are never copied into activity. This is domain-change history, not a complete security/access log: sign-ins, failed attempts and page views are not added here. Real profile saves and booking requests, approvals and cancellations are audited as well. Simulated approvals, replies and automation in the sample panel continue using the separate sample log and are not written into real history. No new migration is needed for this panel.
