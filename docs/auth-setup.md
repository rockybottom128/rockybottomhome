# Authentication and email operations

Current as of 2026-10-10: owner authentication and visitor email verification are deployed to shared development and production at prelaunch 0.3.1.0. The owner confirmed production password setup/login and development email verification. For resource IDs, build settings, secrets inventory, DNS, recovery gaps and deployment evidence, use the [environment runbook](environment-runbook.md). This guide covers application behavior and operator procedures; historical setup states are not current status.

## Implemented scope

The calendar changes below describe the local **0.4.0.0 candidate**, including pending migrations 0005–0006. They are not a claim of remote deployment; the remote inventory remains at the last verified 0.3.1.0 release.

The public home remains static. Owner, visitor and API routes render on the Worker. D1 migrations 0001–0008 define application, authentication and shared calendar records. Better Auth 1.7.7 owns password hashing (its default scrypt), password recovery, sessions and auth rate limits through the Drizzle D1 adapter. Public owner registration and unused auth endpoints are not exposed. All owners have equal permissions; invitation-only accounts activate after password setup. Removing access invalidates sessions, and a database trigger protects the last active owner. Owner dashboard/demo/availability routes require a current active-owner session on every request. The new dashboard displays real D1 visitor verification records. Owner availability uses shared D1 records and authenticated APIs; visitor profiles and booking requests are also persisted. Identity/agent validation remains simulated, and access hardware is not connected.

Visitors supply an email before the server creates/reuses their opaque visitor ID. A cryptographic eight-digit code is sent, expires after ten minutes, permits five attempts and is stored as a keyed digest. Server-side email cooldown, IP limits and separate daily sending budgets apply. Requesting a new code replaces the previous challenge. Only successful delivery enables verification; ambiguous/failed delivery does not automatically retry. D1 atomic batches and a unique challenge-generation index prevent concurrent reuse. Verification creates a one-hour HttpOnly session and saves the email verification result. Owner and visitor cookies/authentication are independent. Verification grants access to saved profiles and real viewing requests when booking is enabled; agent/identity validation is explicitly simulated.

### Email budgets and password recovery

The November 2026 remediation uses the approved provisional allocation of 100 attempts across independent, fixed 24-hour windows per D1 database: 60 visitor verification codes, 20 booking messages, 5 owner invitations, 5 public owner password resets, and 10 report recipients. `src/server/mail.ts` is the single policy definition. Reservations are atomic; ambiguous delivery attempts consume capacity and are never automatically refunded or retried. Invalid configuration and recipient authorization fail before charging capacity. Recipient limits apply separately to each purpose: 10 per hour, except public owner resets at 3 per hour. A recipient rejection does not spend the shared purpose budget. Booking mail retains the visitor recipient policy; reports and owner mail retain their existing authorization checks. Browser input cannot select a mail purpose.

Password-reset requests validate their origin and bounded JSON body and share an IP limit of 15 owner-auth requests per minute. Every valid, accepted reset request gets the same uncached acknowledgment. Account lookup and delivery run under Workers `waitUntil`; unknown and removed owners receive no email. A normalized-address cooldown allows at most one reset operation per minute, including concurrent requests. Public resets always use the reset budget; only authenticated invitations or initial bootstrap can use the invitation reserve. The callback destination is fixed to this site's reset page. Background failures are logged without addresses, tokens, or provider payloads. The acknowledgment confirms acceptance of the request, not delivery.

These limits isolate application mail categories; they are not a guarantee against targeted reset abuse or a provider-wide quota shared by multiple environments. The provider's actual capacity remains to be verified before unrestricted public sending. The old `mail-global` counter is no longer charged, so the new counters start fresh at rollout. A domain-wide verification cap is deliberately deferred to avoid penalizing users of large shared providers. Turnstile, durable background delivery, operator recovery, and provider-wide monitoring remain separate work. `waitUntil` extends a request by at most 30 seconds after its response; it is not a durable queue. See [Cloudflare's execution-context documentation](https://developers.cloudflare.com/workers/runtime-apis/context/).

Run `npm run test:unit` for all unit and HTTP-handler regression tests, and `npm run test:auth:isolated` for real local Worker/authentication integration with generated credentials and fake mail. The installed `.github/workflows/tests.yml` defines the **Build and application tests** job for PRs to main and main pushes. It uses Node 24 to run build, type checks, unit tests, and isolated authentication with read-only repository permission, no deployment secrets, and no deployment. Publishing workflow changes requires the owner maintenance account; adding the new check to required branch checks is a separate owner-controlled action. Installation and local validation do not establish that the hosted workflow has run successfully; verify the job result for the exact PR commit in GitHub Actions.

State-changing requests require the configured exact Origin, JSON and bounded inputs. Secrets are server-only. Protected responses use no-store and no-referrer. Owner recovery links carry tokens in URL fragments, not request URLs, and the browser removes the fragment before submission. Recovery tokens use Better Auth's hashed verification identifiers. Session cookies are Secure on HTTPS; local loopback testing uses HTTP. The hostname must exactly match APP_ORIGIN, which also prevents unconfigured preview hosts from opening authentication endpoints.

## Local development and tests

1. `npm ci` and generate three independent random secrets into ignored `.dev.vars` (see `.dev.vars.example` for names, never use example placeholders).
2. `npm run db:migrate:local` applies all migrations only to local D1.
3. `RB_LOCAL_AUTH=1 npm run build` selects `wrangler.auth-local.json`; regular builds retain the original production Worker config and have no D1 binding.
4. `npx wrangler dev --config dist/server/wrangler.json --port 4324 --ip 127.0.0.1 --persist-to .wrangler/state --inspector-port 9244` starts the dynamic preview. The older static server on 4322 cannot serve these authenticated routes.
5. Prefer `npm run test:auth:isolated`, which creates disposable local D1 and a fake-mail runtime on port 4325 without touching the persistent preview. The lower-level `node tests/auth-integration.mjs` runs against a deliberately prepared localhost fixture and fictional owner@example.com / visitor@example.com accounts. It exercises password setup/reset/replay, owner sessions, last-owner protection, CSRF, OTP cooldown/replacement/concurrency/expiry/attempts, visitor ID reuse and owner/visitor isolation. It deliberately resets local rate-limit/test challenge state; never point it at live data.

MAIL_MODE=test stores fictional messages only in the local D1 `local_test_mail` table. It is rejected on non-loopback origins, has no public inbox route and is not a real mail provider. No real credentials or personal data should be used in this test mode. The local test account password is randomized by the integration test and is never printed. These tests do not establish real Resend delivery or remote password-hash CPU feasibility.

Restart Wrangler after rebuilding so its module graph and static asset manifest match the new output. On this Linux machine the persistent local runtime is the user service `rockybottom-auth-preview`: `systemctl --user restart rockybottom-auth-preview`. This keeps the preview independent of an agent terminal session. It is a local development service, not website hosting.

## Secure Resend setup (operator steps)

Gmail has been replaced by Resend. No Google account or mailbox password is needed. Keep the existing **Sending access** key restricted to `notify.rockybottomhome.com`; the notification backend must never receive a full-access inbox key.

1. From the repository directory run `python3 scripts/setup/connect-resend.py` in your own terminal. Paste the send-only API key into its hidden prompt. It saves only RESEND_API_KEY in ignored `.dev.vars` with owner-only permissions, never prints it, and does not change delivery mode or send a message. It refuses to overwrite an existing key. Never paste the key in chat or a command argument.
2. For the deployed development environment, enter RESEND_API_KEY in Cloudflare's encrypted Worker secrets. Keep AUTH_SECRET and OTP_SECRET there too. BOOTSTRAP_TOKEN is only for explicitly provisioned first-owner setup on an empty environment and is removed afterward; neither existing remote environment retains one. Do not use Wrangler vars, Git, PR text, screenshots, or browser storage for secrets.
3. Configure MAIL_MODE=resend, MAIL_FROM=bookings@notify.rockybottomhome.com and MAIL_REPLY_TO=bookings@rockybottomhome.com. Visitor delivery uses VISITOR_EMAIL_DOMAINS plus explicit MAIL_ALLOWED_RECIPIENTS exceptions; missing both denies visitor delivery. Owner mail independently requires an active/invited owner record. The sender and reply address are checked on the server; no personal email is placed in either header. Only the verification/invitation/reset flows can send messages, not arbitrary browser-supplied bodies.
4. Local real-mail trials require a deliberate MAIL_MODE=resend override and approved recipients in `.dev.vars`, followed by a rebuild and preview restart. Keep fictional integration tests in MAIL_MODE=test; they refuse real-mail overrides. Do not enable real delivery for owner@example.com or visitor@example.com. Initially test verification through `/viewings/` with an approved owner-controlled email. Check mailbox delivery and code verification, and confirm the visitor result in the owner dashboard.
5. Successful API acceptance is not proof of inbox delivery. Provider rejection, missing receipt or timeout leaves the code unusable and returns a generic failure. There are no automatic retries after ambiguous sends. Delivery/bounce webhooks and a durable email-status inbox are later work.

Automated messages send from `Rocky Bottom <bookings@notify.rockybottomhome.com>`. Replies go to `bookings@rockybottomhome.com`; root-domain receiving DNS was verified, but the application does not read mail or provide an owner inbox. Future receiving credentials belong in a separate backend with controlled owner/agent access. Resend's dashboard retention must not serve as the permanent booking conversation archive.

## Remote environments

Shared dev and production use separate Workers, D1 databases and authentication secrets, with fixed HTTPS origins. Both have migrations 0001–0004 applied. Runtime secrets stay on their respective Workers. Refer to the [environment runbook](environment-runbook.md) for the verified inventory and build configuration.

Ordinary production-Worker version previews are not a secrets-isolation boundary and are not the authenticated shared-dev site. Only trusted source may run with a Worker's credentials.

## First owner and everyday account management

For a new, empty environment with explicitly configured BOOTSTRAP_OWNER_EMAIL and a temporary BOOTSTRAP_TOKEN, run `python3 scripts/setup/bootstrap-owner.py` locally, supply the configured development origin, and enter the one-time bootstrap secret in its hidden prompt. The server uses BOOTSTRAP_OWNER_EMAIL; request bodies cannot select another initial owner. Only one bootstrap claim can be made, and existing owner records prevent repeat setup. No initial password is chosen by the agent: the mailbox owner follows the emailed setup link and enters their password directly in the website. Remove the bootstrap secret after success.

An active owner can invite other owners from the protected dashboard. Each invitation sends a password-setup link. If email delivery fails after saving an invitation, the intended owner can request another setup link from sign-in. Active/pending accounts use password recovery instead of duplicate invitations. An owner can explicitly reinvite a removed email; the old password is replaced with an unknown random credential and sessions are revoked until new password setup completes. Removed owners remain in the audit history and cannot enter the dashboard. Password reset revokes existing sessions. Losing all access requires an explicit operator recovery procedure, not a hidden public backdoor.

Owner-management responses distinguish invalid input (400), missing/already-removed accounts (404), existing active/pending accounts or last-active-owner protection (409), rate limits (429 with Retry-After), and unexpected service failures (503). If an invitation is saved before delivery fails, the response includes `invitationSaved: true` and password-setup recovery guidance; it uses 429 for a known email rate limit and 503 for an unconfirmed delivery failure. Do not retry by creating a second invitation. Malformed JSON is normalized to a generic invalid-request error across API routes without exposing parser details.

## Follow-up before unrestricted operation

Verify actual mailbox delivery and sender identity, API key restriction/revocation, durable remote D1 reads/writes across devices, HTTPS Secure cookies, sender allowlist and daily limits, owner invitation/removal across sessions, password CPU timing under Cloudflare's plan, backup/retention policy, and a second security review. Bounded expired-auth-record cleanup is described below; business history and local test messages still need a separate retention policy. Public sending beyond the development allowlist needs additional abuse controls and a reviewed capacity policy.

## Security headers and expired-record cleanup

Middleware applies `nosniff`, framing denial (`X-Frame-Options` and CSP `frame-ancestors`), `Referrer-Policy: no-referrer`, and CSP restrictions on base URLs and embedded objects. HTTPS runtime responses get one-year HSTS without `includeSubDomains` or preload. `public/_headers` mirrors the policy for Cloudflare static assets, including the prerendered homepage and version file. Cloudflare absolute header rules ignore the request scheme, so static HSTS is scoped to `rockybottomhome.com` and this account's `*.accts-e61.workers.dev` hosts, excluding loopback. Browsers ignore HSTS received over HTTP. The asset rules remain in the build directory even though `.assetsignore` prevents them from being publicly served. The isolated Worker test checks actual static and dynamic responses and preserves the version file's `no-store` rule.

The full resource policy is **report-only**, including scripts and styles. Violations appear in browser developer tools; there is no remote reporting endpoint or claim of collected reports. Astro 7 supports generated CSP hashes, but existing inline styles and interactive pages still need a dedicated compatibility pass before enabling full enforcement. The baseline framing/base/object restrictions are enforced now. See [Cloudflare static headers](https://developers.cloudflare.com/workers/static-assets/headers/) and [Astro CSP](https://docs.astro.build/en/reference/configuration-reference/#securitycsp).

After migration 0014, requests to configured owner/API/viewing routes schedule best-effort cleanup through `waitUntil`. A D1 lease permits one sweep per database every 15 minutes, with a 10-second per-isolate claim throttle. Each sweep deletes at most 100 rows from each eligible table in one atomic batch. Cleanup failure logs a generic warning and leaves request results unchanged; the lease expires normally for a later attempt. There is no Cron Trigger, guaranteed cleanup deadline, or background work while the site is idle.

Eligible records are expired application limits and owner/visitor sessions, expired owner verification tokens, auth-library limits inactive for over 24 hours, and visitor challenges expired and inactive for over 24 hours. The auth-library inactivity cutoff exceeds the currently configured limiter windows; revisit it if those windows are increased. Unverified registrations become eligible after 24 hours without a verification request, only when no challenge, session, booking, conversation, profile, identity, agent, selfie or audit reference remains. Fresh requests update `last_verification_requested_at` atomically before visitor lookup, protecting an old registration during a new code request. Verified visitors, owners, audits, bookings, messages, reports and outbox history are retained. No automatic email retries are introduced.

The additive migration creates the activity column and expiry indexes; it deletes no records. Apply it before deploying this application version. Production migration/backup preparation remains a separate owner-controlled operation; see the [environment runbook](environment-runbook.md#hardening-migration-0014--dev-verified-production-pending).

References: [Better Auth password authentication](https://better-auth.com/docs/authentication/email-password), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Resend sending API](https://resend.com/docs/api-reference/emails/send-email), [Resend API permissions](https://resend.com/docs/api-reference/api-keys/create-api-key), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## Visitor demo switch

Migration 0004 adds a database-backed `visitor_demo` setting, disabled by default. In the 0.4.0.0 candidate its dashboard label is **Visitor booking settings**. The same switch now gates visitor email sending/verification, profile read/write, calendar access and booking read/write. Off preserves existing records and holds, blocks visitor actions, and leaves owner login/calendar/request management available. Owners can cancel requests while visitors are paused. Sign-out remains available. Already-dispatched email cannot be recalled. No cached settings are used; booking insertion checks the switch again inside the transaction. Enabling does not remove recipient restrictions or rate limits. Do not reset this owner-controlled value during deployments.

Saved agent details have the literal status `simulated_pass`, never real license/contact verification. Bookings preserve the submitted profile snapshot and require owner acknowledgment of the simulation before approval. Approval/cancellation and eligible owner-initiated messages now use the mail service, with durable outbox status. No Stripe, lockbox or automatic-approval calls occur. See [visitor booking](visitor-booking.md).

The authenticated owner dashboard also includes the earlier interactive sample
workflow panels (request approval/cancellation, automation, availability,
conversation replies and sample activity). These share `OwnerWorkflowDemo.astro`
with `/owner/demo/`. Sample owner controls appear only on the standalone demo;
the authenticated dashboard retains real database-backed owner management.
Sample actions do not send mail, install PINs or write booking records. Request
and reply examples reset on reload; the availability link opens the real shared D1 calendar. The visitor demo switch remains independent of these
owner-only sample controls.


## Deployment and existing owner recovery

The permanent dev branch and Git-triggered deployment are operational. Follow [family workflow](family-workflow.md); the exact commands and Cloudflare settings are in the [environment runbook](environment-runbook.md). Future dev batches retain the same database, credentials and owner settings. Production promotion remains a separate reviewed PR merge.

The existing production owner was provisioned separately, completed email/password setup and signed in successfully. Production has no bootstrap token. Use **Set or reset my password** on `/owner/` for active or invited accounts. Do not re-seed an existing owner or reset the visitor-demo setting during deployments.

For historical production initialization, an invited owner record and auth credential were seeded with a random discarded password, then activated through emailed password setup. There is no documented reusable production-seeding command here; a new production installation needs a reviewed provisioning procedure based on current schema/auth logic. Loss of all account access requires authorized operator recovery.

Apply pending production migrations explicitly during reviewed preparation; the dev deploy script never migrates production. After promotion, verify the actual main commit and version, protected routes and approved email flows. See [versioning](versioning.md) for release tags. Deploying is not official launch authorization.

## Email testing policy update (0.3.1.0)

Visitor verification accepts exact domains listed in `VISITOR_EMAIL_DOMAINS`:
`farts.cloud`, `scottdempsey.com`, and `table42.cafe`. Matching ignores case but does
not include subdomains or lookalike suffixes. Existing explicit test addresses in
`MAIL_ALLOWED_RECIPIENTS` are also supported for local fixtures and controlled
exceptions. Missing both settings denies visitor mail. A rejected visitor address
is checked before any visitor row or challenge is created.

Owner mail is independent of visitor-domain restrictions: the mail service checks
that its recipient is an invited or active owner before sending setup/reset mail.
The public visitor API cannot select owner-mail delivery. Only authenticated
active owners can create invitations. Existing rate limits and the visitor-demo
switch remain enforced. This policy was deployed with PR #9 at 0.3.1.0; future source edits still require reviewed promotion to change live behavior.

Availability rules and dated exceptions now use D1 through migration 0005. New visitor bookings are real D1 records with migration 0006. Historical browser-local examples and the separate dashboard samples remain fictional and are never imported. No browser examples or legacy scaffold availability records are imported. See [calendar availability](calendar-availability.md) for precedence, time-zone rules, concurrency and migration review. The 0.4.0.0 candidate is now published to shared dev; production remains at its prior release. See the environment runbook for deployment evidence.

## Owner activity history

The 0.4.0.0 candidate moves shared Availability and database-backed Activity above the sample panels. Activity displays the latest 50 recorded calendar/account/demo-setting changes, including calendar before/after details. Successful visitor verification and owner password setup/reset now append safe audit events; this does not log codes, tokens, passwords or email bodies. See [calendar availability](calendar-availability.md#dashboard-activity) for coverage and historical limits.

## Booking notifications and owner messages

Migration 0007 makes approval/cancellation notifications and owner-initiated messages durable. Active-owner authentication and same-origin JSON checks protect both message creation and sending/retrying queued email. Only future pending/approved bookings accept new owner messages; the server derives their verified recipient. Visitor APIs never expose owner message history or provider receipts. Existing recipient restrictions and mail rate limits still apply. The visitor switch does not prevent owners managing existing requests and notifying their visitors.

The dashboard reports provider acceptance separately from unknown/failed sends. No inbound mailbox, webhook delivery confirmation or automatic retry worker is enabled. See [visitor booking](visitor-booking.md#live-owner-calendar-and-email-migration-0007) for concurrency, retry safety and migration review.

## Additional visitor testing allowlist — 2026-10-11

The feature branch adds exact domains `transfix.io`, `trshvac.com`, and `trs-hvac.com`, retaining `farts.cloud`, `scottdempsey.com`, and `table42.cafe`, in local/dev/production source configuration. This does not change deployed environments until publication.

`VISITOR_EMAIL_ADDRESSES` is an optional private, comma-separated list of additional exact visitor addresses. It is combined with the existing private `MAIL_ALLOWED_RECIPIENTS` exceptions; neither enables an entire mailbox-provider domain. Matching ignores case but does not collapse dots or plus aliases, and does not allow subdomains. Five owner-approved Gmail/Yahoo addresses are staged privately on the operator PC, not committed to source or test fixtures. The local preview uses the additions from ignored `.dev.vars`.

The new `VISITOR_EMAIL_ADDRESSES` private binding was provisioned on shared dev on 2026-10-11, after confirming it did not already exist; the separate `MAIL_ALLOWED_RECIPIENTS` secret was preserved. Publishing this source enables the additions on dev. No authentication or mail-provider credentials need changing. Production needs the same allowlist preparation only when separately authorized for promotion; a code merge alone does not provision private values. Visitor booking must still be enabled and email verification completed. Tests use fictional individual addresses and fake delivery.

## Database-backed visitor allowlist (migration 0008)

The next candidate replaces ongoing environment-based visitor permission checks with owner-managed D1 records. Existing per-environment domains/private exceptions import exactly once; afterward the dashboard list is authoritative, including when empty. Owner authentication remains independent. See [visitor allowlist](visitor-allowlist.md) for editing, effects on existing sessions/bookings, audit and release preparation. Earlier environment configuration sections describe the import sources, not overrides for an initialized database.

## Visitor email filter — 2026-10-11 candidate

Migration 0009 preserves existing Allow entries and adds an empty Block list plus Global email filter, initially On. The visitor enable switch wins first; then any Allow match wins; then Block matches deny; unmatched email follows the Global filter (On denies, Off permits). Verification remains mandatory. Both lists and the slider are owner-managed, revision-protected and audited. See [visitor email rules](visitor-allowlist.md) for precedence, initialization, migration and rollback review. Shared-dev publication applies pending 0008/0009; production preparation remains separately authorized.
