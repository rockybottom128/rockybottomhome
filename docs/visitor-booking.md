# Saved visitor profiles and real viewing requests

Part of the unpublished prelaunch 0.4.0.0 batch, extended by owner request after availability testing. Email verification and D1 availability were already real. This update makes profile storage and booking submission real as well; it is not official launch or real identity/license verification.

## Visitor flow

1. Enter an allowed email and receive the real eight-digit verification code (local isolated tests use fake mail). The email, code challenge and successful verification result are server records.
2. Save a name and select prospective buyer or agent. Agents provide licensed name, issuing state/jurisdiction, license number and brokerage; their verified account email is the contact address. Inputs have required fields and bounded lengths; there is no real license lookup. All completed profiles receive the explicit `simulated_pass` validation status, for buyer identity or agent credentials respectively. No real-verification fields in `agent_credentials` or `identity_attempts` are populated.
3. View server-calculated Eastern-time slots, excluding every pending/approved hold. Selecting a slot alone changes nothing.
4. Submit a real pending request. The server rechecks availability and profile, then atomically holds the slot. Agents must affirm they will attend. One upcoming pending/approved request per verified email is allowed. Owners must approve before the visitor treats it as an approved visit. No entry or access code is granted.
5. View saved requests after signing in from another browser/device. Visitors can see and cancel only their own requests. Cancellation requires a reason and releases the hold; the time appears again only if the calendar permits it. Requests do not expire automatically before their scheduled end; owners can cancel unused requests.

Owner review appears above the sample workflow. It includes verified contact email and the visitor-provided profile snapshot. Approval requires acknowledging that validation is simulated. Owner approval/cancellation remains usable while the visitor booking switch is off. Booking updates are shown in the portal and saved Activity, **not sent by email** in this batch. Only verification and owner-account emails use the mail service. There are no lockbox jobs, PINs, Stripe checks, real license checks or automatic approvals.

## Data and concurrent changes

Migration 0006 adds `visitor_intake_profiles` with a revision and explicit simulated status. Booking metadata includes a request retry key, immutable profile snapshot, validation status and cancellation reason. Existing records and scaffold tables remain intact; no localStorage data is imported. Old bookings default to `unverified`, not a simulated or real pass.

Profiles are scoped to the visitor session, and stale profile saves return 409. Input cannot select another visitor or mark validation as real. The booking API derives visitor identity, UTC times, duration, mode and profile snapshot from server records. A source label of MLS is only a navigation/referral hint, never verified referral or agent identity.

The booking transaction conditionally advances `calendar_state.revision`, inserts a concrete `availability_slots` row and `bookings` record, and writes an audit event. It checks the booking switch, current profile revision and one-upcoming-request rule. Unique request keys make retries/double clicks idempotent; SQLite overlap triggers provide a second constraint against competing reservations. Failures roll back the transaction. All booking status changes advance the calendar revision and require the booking revision, so stale owner/visitor actions fail instead of overwriting one another.

A calendar change validates the proposed rules against existing holds, then conditionally commits at the same revision. Concurrent bookings also change that revision. Owners must cancel an affected request before adding blocks or removing availability that would invalidate its slot; no request is silently canceled. Visitor slot responses contain no agent details, owner notes, booking identities or audit history.

## Gate, limits and deployment

The existing `visitor_demo` switch is labeled **Visitor booking settings**. It defaults off on fresh installations and is never reset by this migration. Off blocks visitor verification/profile/calendar/booking access; it does not erase records or release existing holds. Owners remain able to manage requests. Enable it deliberately for testing and cancel test holds when finished. An empty calendar plus dated available periods offers controlled test openings; dated availability never overrides a recurring block.

Apply reviewed migrations 0005 and 0006 before this code. Production preparation needs separate authorization, a backup/recovery point and rollback review. Older code may ignore live holds, so pausing visitors and reviewing held requests is necessary before a rollback. Development and production data remain separate.

Run `npm run test:booking`, `npm run test:availability` and `npm run test:auth:isolated`. Tests use disposable local databases/fake mail and cover validation, profile isolation, immutable snapshots, retries, competing holds, stale actions, blocked-slot protection, simulation acknowledgment, disabled booking, approval/cancellation and no access/email jobs. Test remote cross-device behavior only after authorized dev publication. Profile retention/cleanup, full security/access logging and real identity/agent verification remain later work; Activity records domain changes rather than every page view or failed request.
