# 0.3 database and authentication batch

Branch: `rockyadmin/database-owner-auth`. Local implementation and real Resend email/code verification have been tested successfully. The isolated development D1 database and Worker are now provisioned with private secrets. The owner confirmed successful real password setup and dashboard sign-in on the Cloudflare development environment. No production changes have been deployed.

## Implemented scope

The public home remains static. Owner, visitor and API routes render on the Worker. D1 migrations 0001–0004 define application and authentication records. Better Auth 1.7.7 owns password hashing (its default scrypt), password recovery, sessions and auth rate limits through the Drizzle D1 adapter. Public owner registration and unused auth endpoints are not exposed. All owners have equal permissions; invitation-only accounts activate after password setup. Removing access invalidates sessions, and a database trigger protects the last active owner. Owner dashboard/demo/availability routes require a current active-owner session on every request. The new dashboard displays real D1 visitor verification records. Old calendar/demo actions remain explicitly fictional; bookings and access hardware are outside this batch.

Visitors supply an email before the server creates/reuses their opaque visitor ID. A cryptographic eight-digit code is sent, expires after ten minutes, permits five attempts and is stored as a keyed digest. Server-side email cooldown, IP limits and a development daily sending cap apply. Resend replaces the previous challenge. Only successful delivery enables verification; ambiguous/failed delivery does not automatically retry. D1 atomic batches and a unique challenge-generation index prevent concurrent reuse. Verification creates a one-hour HttpOnly session and saves the email verification result. Owner and visitor cookies/authentication are independent. Verification stops before real agent/identity checks or bookings.

State-changing requests require the configured exact Origin, JSON and bounded inputs. Secrets are server-only. Protected responses use no-store and no-referrer. Owner recovery links carry tokens in URL fragments, not request URLs, and the browser removes the fragment before submission. Recovery tokens use Better Auth's hashed verification identifiers. Session cookies are Secure on HTTPS; local loopback testing uses HTTP. The hostname must exactly match APP_ORIGIN, which also prevents unconfigured preview hosts from opening authentication endpoints.

## Local development and tests

1. `npm ci` and generate three independent random secrets into ignored `.dev.vars` (see `.dev.vars.example` for names, never use example placeholders).
2. `npm run db:migrate:local` applies all migrations only to local D1.
3. `RB_LOCAL_AUTH=1 npm run build` selects `wrangler.auth-local.json`; regular builds retain the original production Worker config and have no D1 binding.
4. `npx wrangler dev --config dist/server/wrangler.json --port 4324 --ip 127.0.0.1 --persist-to .wrangler/state --inspector-port 9244` starts the dynamic preview. The older static server on 4322 cannot serve these authenticated routes.
5. `node tests/auth-integration.mjs` runs against localhost and fictional owner@example.com / visitor@example.com accounts. It exercises password setup/reset/replay, owner sessions, last-owner protection, CSRF, OTP cooldown/replacement/concurrency/expiry/attempts, visitor ID reuse and owner/visitor isolation. It deliberately resets local rate-limit/test challenge state; never point it at live data.

MAIL_MODE=test stores fictional messages only in the local D1 `local_test_mail` table. It is rejected on non-loopback origins, has no public inbox route and is not a real mail provider. No real credentials or personal data should be used in this test mode. The local test account password is randomized by the integration test and is never printed. These tests do not establish real Resend delivery or remote password-hash CPU feasibility.

Restart Wrangler after rebuilding so its module graph and static asset manifest match the new output. On this Linux machine the persistent local runtime is the user service `rockybottom-auth-preview`: `systemctl --user restart rockybottom-auth-preview`. This keeps the preview independent of an agent terminal session. It is a local development service, not website hosting.

## Secure Resend setup (operator steps)

Gmail has been replaced by Resend. No Google account or mailbox password is needed. Keep the existing **Sending access** key restricted to `notify.rockybottomhome.com`; the notification backend must never receive a full-access inbox key.

1. From the repository directory run `python3 scripts/setup/connect-resend.py` in your own terminal. Paste the send-only API key into its hidden prompt. It saves only RESEND_API_KEY in ignored `.dev.vars` with owner-only permissions, never prints it, and does not change delivery mode or send a message. It refuses to overwrite an existing key. Never paste the key in chat or a command argument.
2. For the deployed development environment, enter RESEND_API_KEY in Cloudflare's encrypted Worker secrets. Keep AUTH_SECRET, OTP_SECRET and temporary BOOTSTRAP_TOKEN there too. Do not use Wrangler vars, Git, PR text, screenshots, or browser storage for secrets.
3. Configure MAIL_MODE=resend, MAIL_FROM=bookings@notify.rockybottomhome.com, MAIL_REPLY_TO=bookings@rockybottomhome.com, and an explicit MAIL_ALLOWED_RECIPIENTS list. Empty means no delivery. The sender and reply address are checked on the server; no personal email is placed in either header. Only the verification/invitation/reset flows can send messages, not arbitrary browser-supplied bodies.
4. Local real-mail trials require a deliberate MAIL_MODE=resend override and approved recipients in `.dev.vars`, followed by a rebuild and preview restart. Keep fictional integration tests in MAIL_MODE=test; they refuse real-mail overrides. Do not enable real delivery for owner@example.com or visitor@example.com. Initially test verification through `/viewings/` with an approved owner-controlled email. Check mailbox delivery and code verification, and confirm the visitor result in the owner dashboard.
5. Successful API acceptance is not proof of inbox delivery. Provider rejection, missing receipt or timeout leaves the code unusable and returns a generic failure. There are no automatic retries after ambiguous sends. Delivery/bounce webhooks and a durable email-status inbox are later work.

Automated messages send from `Rocky Bottom <bookings@notify.rockybottomhome.com>`. Replies go to `bookings@rockybottomhome.com`; root-domain receiving must be verified before depending on replies. The current branch does not read mail or provide an owner inbox. Future receiving credentials belong in a separate backend with controlled owner/agent access. Resend's dashboard retention must not serve as the permanent booking conversation archive.

## Remote development environment

Wrangler is authenticated with account/user read and Workers/D1 write scopes. Development Worker: `rockybottomhome-auth-dev`. Development URL: https://rockybottomhome-auth-dev.accts-e61.workers.dev. Database: `rockybottomhome-auth-dev` (`46691edf-8f7d-48e2-9e72-0586cef46e99`), migrations 0001–0004 applied. The initial bootstrap secret was removed after creating the owner invitation. `RB_AUTH_DEV=1 npm run build` selects `wrangler.auth-dev.json`; default builds still use the original production configuration. This isolated auth backend was provisioned under the owner’s explicit continuation of the remote database/backend setup; it does not replace the existing Git-driven production workflow.

Use an isolated development D1 database and a **separate authentication development Worker/environment** with its own secrets and fixed HTTPS origin. Do not bind this development database or Resend credentials to the existing production Worker or all contributor previews. Ordinary version-preview URLs of one Worker are not a secret-isolation boundary. Configure and review this new development target separately before its first publication; do not change the existing production routing, domains, Git integration or direct-deploy policy as a side effect.

After account access is available: create the development D1 database, record the returned real ID (never use the local placeholder ID), add its DB binding to the dedicated development config, and apply migrations 0001–0004 remotely **only to that development database**. Set AUTH_ENABLED=true, exact APP_ORIGIN, MAIL_MODE, MAIL_FROM, MAIL_REPLY_TO, MAIL_ALLOWED_RECIPIENTS and BOOTSTRAP_OWNER_EMAIL on that environment. Publish only after reviewing its concrete destination and credentials isolation. Benchmark owner password hashing within the actual Worker plan; do not weaken scrypt to fit the free CPU limit. Production resources and secrets remain a separate later step.

## First owner and everyday account management

Run `python3 scripts/setup/bootstrap-owner.py` locally, supply the configured development origin, and enter the one-time bootstrap secret in its hidden prompt. The server uses BOOTSTRAP_OWNER_EMAIL; request bodies cannot select another initial owner. Only one bootstrap claim can be made, and existing owner records prevent repeat setup. No initial password is chosen by the agent: the mailbox owner follows the emailed setup link and enters their password directly in the website. Remove the bootstrap secret after success.

An active owner can invite other owners from the protected dashboard. Each invitation sends a password-setup link. If email delivery fails after saving an invitation, the intended owner can request another setup link from sign-in. Active/pending accounts use password recovery instead of duplicate invitations. An owner can explicitly reinvite a removed email; the old password is replaced with an unknown random credential and sessions are revoked until new password setup completes. Removed owners remain in the audit history and cannot enter the dashboard. Password reset revokes existing sessions. Losing all access requires an explicit operator recovery procedure, not a hidden public backdoor.

## Remaining acceptance before live operation

Verify actual mailbox delivery and sender identity, API key restriction/revocation, durable remote D1 reads/writes across devices, HTTPS Secure cookies, sender allowlist and daily limits, owner invitation/removal across sessions, password CPU timing under Cloudflare's plan, backup/retention policy for auth and rate-limit records, and a second security review. This phase has no automated background cleanup yet; rate-limit/auth records and test messages need a retention/cleanup job before unrestricted use. Public sending beyond the development allowlist needs additional abuse controls and a reviewed capacity policy.

References: [Better Auth password authentication](https://better-auth.com/docs/authentication/email-password), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Resend sending API](https://resend.com/docs/api-reference/emails/send-email), [Resend API permissions](https://resend.com/docs/api-reference/api-keys/create-api-key), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## Visitor demo switch

Migration 0004 adds a database-backed `visitor_demo` setting, disabled by default. Any active owner can change it under **Visitor demo settings** in the dashboard; changes are audited. Off blocks visitor send/verify/demo-access API calls before they mutate visitor records or send mail. Sign-out and owner authentication remain available. Already-dispatched emails cannot be recalled. No cached settings are used. Verified visitors can enter `/viewings/demo/` only when enabled, and the demo checks access before simulated identity/booking submission and every 15 seconds while open. Simulated profiles/bookings remain fictional browser data; no Stripe, real booking or lockbox calls occur. Enabling does not remove the recipient allowlist or rate limits.

The authenticated owner dashboard also includes the earlier interactive sample
workflow panels (request approval/cancellation, automation, availability,
conversation replies and sample activity). These share `OwnerWorkflowDemo.astro`
with `/owner/demo/`. Sample owner controls appear only on the standalone demo;
the authenticated dashboard retains real database-backed owner management.
Sample actions do not send mail, install PINs or write booking records. Request
and reply examples reset on reload; the availability demo retains its existing
browser-local storage. The visitor demo switch remains independent of these
owner-only sample controls.


## Automatic development builds

Publish an approved committed feature batch with `npm run publish:dev -- --publish`.
This atomically pushes the feature branch and updates permanent `dev` with exactly
that source tree. It preserves dev history without force-pushing or merging old
dev changes into the feature branch. Concurrent pushes fail safely; investigate
before retrying. Open the production PR from the feature branch, never from dev.
The shared site keeps the same D1 database, secrets and URL across batches.
Test one batch at a time; wait for its build to finish before publishing another.
This changes publication, not the browser-only sample calendar storage.


The dedicated development Worker must be connected to the existing GitHub repo
`rockybottom128/rockybottomhome`, independently of the production Worker's builds.
In **rockybottomhome-auth-dev → Settings → Builds**, use:

- Branch: `dev` (the permanent deployment branch of this development Worker,
  even if Cloudflare labels the field “production branch”).
- Root directory: `/` (the Git repository root already contains package.json).
- Build command: `npm run build:auth-dev`.
- Deploy command: `npm run deploy:auth-dev`.
- Disable builds for other/non-production branches on this development Worker.
- Use a build token with Workers Scripts Edit and D1 Edit for this account.

Runtime email/auth secrets stay on the Worker; do not copy them into build
variables. The deploy command validates the target, applies pending migrations
only to development D1, and deploys the generated Astro configuration. Migrations
do not reset the database; future migrations still require review for data effects.
The branch guard accepts dev and approved contributor prefixes, and rejects main.
Existing production Worker builds remain unchanged.

The one-time remote Git connection requires Workers Builds Configuration Edit;
the current narrow Wrangler OAuth grant does not include this permission. Verify
a successful build for the exact pushed commit before calling automatic builds
ready. The owner connected this Worker to GitHub on October 10, 2026, initially using `rockyadmin/database-owner-auth`. Switching its primary branch to
`dev` is a one-time dashboard change still requiring remote confirmation. The first automatic build passed for commit `a3d8318`; the owner confirmed login
and visitor email verification afterward.

Cloudflare may suggest renaming the default `wrangler.json` to match this Worker.
Do not apply that suggestion: the default configuration belongs to production,
and `build:auth-dev` explicitly selects `wrangler.auth-dev.json`. Review any
automatically generated configuration PR instead of merging it.

`npm run test:auth:isolated` tests the current source in a disposable local checkout,
D1 database and fake-mail sink on port 4325. It never uses the real preview's
credentials, data or rate limits. The normal local preview remains on port 4324.

Creating a PR on another computer needs only the pushed feature branch. No
Cloudflare or Resend secrets should be copied there. Production preparation and the remaining merge steps are recorded below.


## Production preparation (October 10, 2026)

Production D1: `rockybottomhome-production`, ID
`7743925a-8b60-4d73-8676-7f6ead34f596`, separate from development. Migrations
0001–0004 were applied explicitly under the owner's production-setup request.
The initial owner is present in `invited` status, with a random discarded password;
no development password, sessions or visitor records were copied. There is no
production bootstrap token. `visitor_demo` is `off`.

`wrangler.production.json` supplies the production DB binding and exact canonical
origin `https://rockybottomhome.com`. Astro selects it only for Cloudflare's main
build with a valid CI commit identity. Ordinary branch builds keep the original
unconfigured `wrangler.json`; the dedicated auth development build still uses its
own config and DB. The existing production build/deploy commands remain unchanged:
`npm run build` and `npx wrangler deploy` (using Astro's generated configuration).
No direct production code deployment is part of preparation.

Production uses independent AUTH_SECRET and OTP_SECRET, the existing domain-scoped
send-only Resend key, and the private approved-recipient list. Required secret
names in the production config make a missing-secret deployment fail explicitly.
Because the Worker already has undeployed preview versions, secrets are staged
with `wrangler versions secret bulk` without activating a version. The public
site must remain on 0.2.0.0 until the approved PR merge. The recipient list is
initially limited to the owner's approved test email, even on production.

Worker version previews are not a secrets isolation boundary: Wrangler preserves
Worker secrets across versions. Production Worker preview code and its build token
must therefore remain trusted. The separate auth-development Worker has separate
authentication keys and data. Do not grant untrusted repositories or contributors
access to either Worker's build credentials.

Before merge, recheck the updated PR head/checks, production secret names, all
pending migrations and the disabled visitor setting. Apply future production
migrations explicitly before their authorized promotion; the development deploy
script never migrates production. This configuration is not launch authorization.

After the separately approved merge and successful main deployment:
1. Verify `/version.json` identifies the actual merge commit and 0.3.0.0.
2. At `/owner/`, enter the configured owner email and choose **Set or reset my
   password**. Use the emailed link to set a production password, then sign in.
3. Confirm the visitor demo is disabled; enable only for an intentional test.
4. Check wrong-password rejection, logout, verification delivery and saved results.
   Disable visitor testing afterward. Identity, bookings and lockbox access remain
   simulations. Receiving mail / a shared inbox remains outside this batch.


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
switch remain enforced. These changes need a new branch review and production
promotion; changing source does not change live email policy.

Availability blocks, default ranges, sample bookings and sample feedback still
use browser-local storage. They are not D1-backed and should not be used to test
cross-device availability. A later scheduling implementation must persist owner
rules and exceptions and calculate visitor availability from the same server data.
