# Owner-managed visitor allowlist

The 0.4.0.0 candidate adds an owner dashboard card below the existing sections. Separate Allow and Block domain/email lists have Add, Edit and Remove controls. Every save requires an active owner, same-origin JSON and the latest list revision. Saving disables repeat clicks; errors remain visible; conflicts require reloading the list. Owner changes record actor, before/after values and time in D1, and appear in saved Activity after refresh. The list and its history are owner-only.

## Rules and effects

- Domains match exactly, ignoring case; no subdomains or wildcard matching. Enter a plain domain without a URL or @.
- Individual email addresses match exactly after trimming and lowercasing. Dot/plus variants are distinct. Any matching domain OR individual entry grants permission.
- With Global email filter On, an empty Allow list denies all visitors. Owner email/password access does not depend on this list. The visitor-booking enable switch remains a separate gate; owners may manage the list while it is off.
- Database checks run before issuing a verification code, when verifying it, on each authenticated visitor request, and before sending visitor mail. A policy change that excludes a visitor blocks their existing session on the next request; adding it back permits an otherwise valid, unexpired session again.
- Removal does not erase a visitor, cancel a held booking, or revoke owner access. Owners must manage existing bookings explicitly. Email to an excluded recipient fails preflight and is shown as not sent. Requests/emails already in flight may finish; changes cannot recall an accepted email.

## Migration 0008 and initialization

The additive migration creates `visitor_allowlist_state`, `visitor_allowlist_entries`, and `visitor_allowlist_audit`. It contains no private email values and does not reset accounts, sessions, bookings or existing settings.

On the first policy read, runtime imports that environment's current `VISITOR_EMAIL_DOMAINS`, `MAIL_ALLOWED_RECIPIENTS`, and `VISITOR_EMAIL_ADDRESSES` once, normalizing/deduplicating them. Atomic claim, insert and import audit ensure simultaneous first requests cannot reseed. Invalid initial configuration fails closed without marking initialization complete. Missing settings import an intentionally empty list. The database is authoritative afterward: environment changes and deployments never resurrect removed entries or overwrite owner edits, even if every entry was removed.

Keep the existing variables/private bindings through initialization. They are import sources only, not a fallback or an ongoing permission grant. In production, provision any desired private additions before initialization as separately reviewed preparation; dev and local records are never copied into production. Initializing via an owner GET or visitor policy check writes only the import transaction, not visitor/booking records and not email.

Apply migration 0008 before deploying code that reads these tables. Shared-dev publication uses the existing guarded command and applies pending dev migrations. Production still requires separate authorization, a reviewed backup/recovery point and compatibility plan. Older code would ignore owner edits and return to environment-only checks, potentially reopening removed access: disable visitor booking and reconcile policy before any rollback. Never reset the initialized flag or drop tables to force a reimport.

## Validation

Disposable SQLite/D1 tests cover exact matching, private import, no reseeding, empty policy, removed/unauthenticated owners, cross-origin writes, stale and competing edits, audit attribution, invalid bootstrap rollback, visitor-session exclusion, retained bookings, owner mail independence and failed-closed mail. Isolated Worker tests use fake email only. No automated test sends mail to real allowlisted recipients or resets persistent local/dev/production records.

## Global email filter and Block list (migration 0009)

The visitor verification/booking enable switch is the outer gate: Off denies visitor access regardless of these rules. Within email policy, any Allow domain or exact email match wins over every Block entry and the Global email filter. Otherwise a Block domain or exact email match denies. Unmatched addresses are denied when Global email filter is On and permitted when Off. Permitted visitors must still verify their email; opening the filter never creates a verified session.

The dashboard slider saves immediately with a shared revision, displays the acknowledged saved state, and requires reload after a conflict or uncertain save. It shares owner authorization, audit and duplicate-click protection with list edits. To allow the public at launch, turn Global email filter Off; retain any desired Block entries and Allow exceptions. This does not perform an official launch or enable booking by itself.

Migration 0009 adds a default-On column and a separate empty Block table, preserving all existing Allow entries, accounts, bookings and audit records. It is additive and compatible with the previous allowlist schema; old code ignores blocks/filter and therefore does not enforce the new policy. Apply 0008 and 0009 before this code. Disable visitor access before a rollback, reconcile policy, and do not remove stored rules. Production requires separately reviewed backup/recovery and migration preparation. Tests cover Allow precedence in both directions (domain versus individual), filter modes, block edits/removal, concurrent toggle/list edits and the master switch.
