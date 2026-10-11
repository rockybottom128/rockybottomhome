# Environment and recovery runbook

Last verified: **2026-10-10**, after PR #9. This is the repository's operational configuration reference. Update the verification date and evidence when changing infrastructure. Historical chat summaries and screenshots are supporting evidence, not current configuration authority. Secret values and account recovery codes must never be included here.

## Evidence and ownership

- Repository configuration: Wrangler files, `scripts/production/build-target.mjs`, development publishing scripts, migrations, and GitHub workflows.
- Remote checks on the verification date: live `/version.json` responses, GitHub protections, Worker secret names, pending D1 migrations, and public mail DNS.
- Cloudflare build settings: owner dashboard screenshots and successful Git-triggered builds; not exported through the current operator OAuth grant.
- Resend key restriction and shared use: setup records; secret values and current Resend key permissions were not re-read during this inventory.
- Private operator records live outside the Git checkout. Keep a separate recovery inventory and encrypted credential vault; a project attachment or ignored local file is not a verified backup.

Cloudflare account ID: `e6144913ec6fa3b523d5d7e50cce2c40`. GitHub repository: `rockybottom128/rockybottomhome`. Account login/recovery details belong in the private inventory.

## Environments

| Setting | Shared development | Production |
| --- | --- | --- |
| Worker | `rockybottomhome-auth-dev` | `rockybottomhome` |
| Canonical origin | `https://rockybottomhome-auth-dev.accts-e61.workers.dev` | `https://rockybottomhome.com` |
| Git build branch | `dev` | `main` |
| Build command | `npm run build:auth-dev` | `npm run build` |
| Deploy command | `npm run deploy:auth-dev` | `npx wrangler deploy` |
| Build root | `/` | `/` |
| Configuration | `wrangler.auth-dev.json` | `wrangler.production.json` |
| D1 name | `rockybottomhome-auth-dev` | `rockybottomhome-production` |
| D1 ID | `46691edf-8f7d-48e2-9e72-0586cef46e99` | `7743925a-8b60-4d73-8676-7f6ead34f596` |
| D1 binding | `DB` | `DB` |

These are Cloudflare **Workers Builds**, not Pages. The bare `rockybottomhome.accts-e61.workers.dev` hostname is also production. The production custom domain is attached to the production Worker. A complete DNS/zone export is not preserved in this repository.

On the verification date both sites served prelaunch **0.3.1.0**. Production identified main commit `60dcda607cb3c83ec4fe7dbb5fd56d648267c564`; immutable tag `site-v0.3.1.0` resolves to that commit. Dev identified `4f21af8da1300f497c8ebc768148b37330229c1f`, a no-file-change trigger commit whose tree matches feature commit `6915896e63bcd66210a42400add66dbff1feaeb8`. These are evidence snapshots, not permanent deployment targets.

### Configuration selection

`astro.config.mjs` uses `scripts/production/build-target.mjs`:

1. `RB_AUTH_DEV=1` selects `wrangler.auth-dev.json`.
2. Otherwise `RB_LOCAL_AUTH=1` selects `wrangler.auth-local.json`.
3. Otherwise a Cloudflare main build (`WORKERS_CI=1`, branch `main`, valid 40-character CI SHA) selects `wrangler.production.json`.
4. Other builds select `wrangler.json`, which has no authentication database binding.

Astro generates `dist/server/wrangler.json`; do not edit generated output. Do not accept Cloudflare's generic suggestion to rename the default `wrangler.json` Worker to the dev Worker. The configuration selector intentionally supports both destinations.

### Cloudflare settings outside Git

Both Workers connect to the same GitHub repository. Preserve these settings in the dashboard:

- Dev: primary branch `dev`; builds enabled; other-branch/preview builds disabled; commands from the table above. Cloudflare calls the primary branch “Production branch” even on this development Worker. This setup was successfully exercised after the permanent branch switch.
- Production: primary branch `main`; existing non-production version-preview builds enabled with `npx wrangler versions upload`. Preserve this established preview model; do not silently switch to a different Cloudflare preview product.
- Selected build token: `rockybottomhome build token`. Setup included Workers Scripts and D1 permissions; Artifacts read/write were added after Cloudflare warned they were missing. The complete granted permissions/resource scopes remain to be exported and reviewed. This is not a claim that the historical broad token is the minimum needed for a new project.
- Runtime application secrets belong on each Worker, not in build variables. The supplied dev dashboard showed no build variables/secrets.
- Current operator Wrangler OAuth access supports the used Worker/D1 tasks but not editing Workers Builds configuration. Git build configuration changes required the owner dashboard.

## Publication and GitHub controls

See [family workflow](family-workflow.md) for daily use. From an approved, clean, committed contributor branch, `npm run publish:dev -- --publish` pushes the feature branch and updates `dev` atomically. Approved prefixes are `rockyadmin/`, `karen/`, and `scott/`. The script requires the configured HTTPS origin URL, current main ancestry, and valid release metadata.

The dev snapshot uses the feature's exact tree while retaining prior dev ancestry. It does not merge previous dev content into the feature branch or force-push. Concurrent updates fail the normal push; investigate before retrying. Shared dev has one active batch: wait for its build and testing before publishing another. Future feature branches must include the merged publishing scripts.

Production PRs come from the feature branch to main, **never from dev**. Scott's contributor App created recent PRs; the owner account reviewed and merged. Account identity and permissions matter, not the physical computer. Do not create a PR locally when the user plans to create it elsewhere.

Verified remote protections:

- Classic main protection: at least one approval, code-owner review, stale approval dismissal, resolved conversations, no force-push or deletion.
- Ruleset `22972035`: owner-controlled main updates through PRs, with repository-administrator PR permission; not authorization to skip review.
- Ruleset `24595179`, “Production requires reviewed workflow”: up-to-date main ancestry and required `Workers Builds: rockybottomhome` from integration `85455`, with no bypass actors; deletion/non-fast-forward protection.
- `.github/CODEOWNERS` names `rockybottom128`. Preserve contributor access boundaries and exact-head review.
- `.github/workflows/site-version.yml` validates versions and records immutable source tags on main. `Validate site version` ran successfully, but was not independently listed as a required status in the inspected ruleset. Cloudflare builds also validate version policy.

For a new repository, create equivalent protections using its own resource IDs and identities. Source files alone do not install remote protections. Never weaken protections to get a merge through. An explicit merge instruction for the reviewed PR is required. No auto-merge or direct production deployment is part of normal contributor publishing.

Legacy production-Worker commit previews are useful for the required check and source review, but are not the shared authenticated dev environment. Worker version previews are not a secret-isolation boundary; keep all code allowed to run against a Worker's credentials trusted.

## Database lifecycle

Both databases had migrations `0001_viewings.sql`, `0002_booking_flow.sql`, `0003_auth.sql`, and `0004_visitor_demo_setting.sql` applied; remote migration checks reported none pending.

- Dev deploy validates the exact Worker/account/origin/database and applies pending migrations to dev only.
- Production migrations are applied explicitly as part of reviewed production preparation; the main deploy command is not a migration runner.
- Branch pushes and builds do not reset databases, credentials, owners, or settings. Migrations still need review for destructive effects and compatibility with the running version.
- Development data is not promoted to production. Separate databases and authentication keys were created; dev passwords/sessions/visitor records were not copied.
- Schema recreation produces an empty environment. Recovering existing accounts, visitor records and settings requires a database backup/restore, not just migrations.

A backup schedule, retention policy and tested restore procedure are **not established by this record**. Before risky migrations, document a backup and rollback plan. Rolling back code does not roll back D1 schema/data.

## Runtime configuration and secrets

Both environments use `AUTH_ENABLED=true`, `MAIL_MODE=resend`, the exact canonical `APP_ORIGIN`, `MAIL_FROM=bookings@notify.rockybottomhome.com`, `MAIL_REPLY_TO=bookings@rockybottomhome.com`, and `VISITOR_EMAIL_DOMAINS=farts.cloud,scottdempsey.com,table42.cafe`.

| Secret name | Placement on verification date | Recovery notes |
| --- | --- | --- |
| `AUTH_SECRET` | Dev and production | Independent values per environment; preserve securely or plan rotation/session impact. |
| `OTP_SECRET` | Dev and production | Independent values; rotation affects outstanding verification challenges. |
| `RESEND_API_KEY` | Dev and production | Setup used the same send-only, domain-restricted key; retrieve from the private vault or issue a replacement through Resend. |
| `MAIL_ALLOWED_RECIPIENTS` | Dev and production | Explicit-address exceptions in addition to visitor domains; policy data stored as a secret, not a cryptographic key. Preserve privately and review exceptions. |
| `BOOTSTRAP_OWNER_EMAIL` | Dev only | Initial owner setup address; preserve its account ownership privately. |
| `BOOTSTRAP_TOKEN` | Neither | Temporary first-owner secret was removed; do not recreate on an existing installation as a routine deployment step. |

Secret values were not read for this inventory. Production declares required secret names in its Wrangler configuration. Local `.dev.vars` and `.secrets/` are Git-ignored and must remain outside source control. `scripts/setup/connect-resend.py` uses a hidden prompt for local key entry. No Google/Gmail OAuth client or mailbox password is part of this application.

Historical production setup used `wrangler versions secret bulk` to stage secrets because undeployed preview versions existed. This was an operator setup step, not a routine deploy instruction. Review which version contains intended code, bindings and secrets before activating anything; do not deploy an arbitrary staged version.

## Resend and DNS

Setup records show Resend's Sending access key restricted to `notify.rockybottomhome.com`. Automated mail uses `Rocky Bottom <bookings@notify.rockybottomhome.com>` and replies target `bookings@rockybottomhome.com`. Neither header exposes an owner's personal address. Resend verified the sending subdomain and root domain; the region shown was North Virginia (`us-east-1`).

Public DNS observed on the verification date:

| Relative name in rockybottomhome.com | Type | Target/content |
| --- | --- | --- |
| `@` | MX | `inbound-smtp.us-east-1.amazonaws.com`, priority 10 |
| `notify` | MX | Same target and priority |
| `rsend` | CNAME | `rsend.forge.rmta.net` |
| `send` | CNAME | `send.forge.rmta.net` |
| `rsend.notify` | CNAME | `rsend.forge.rmta.net` |
| `send.notify` | CNAME | `send.forge.rmta.net` |
| `resend._domainkey` | TXT | Provider-issued DKIM public key present |
| `resend._domainkey.notify` | TXT | Provider-issued DKIM public key present |

CNAME records were configured DNS-only in the owner's screenshots. Note the spelling **rsend** for the CNAME, versus **resend** in the DKIM selector. Obtain the actual records from Resend when reprovisioning; do not invent DKIM values or assume another account/region gets these same targets.

No TXT answer was observed for `_dmarc` or `_dmarc.notify`. Earlier screenshots showing a suggested DMARC record do not prove installation. No `www` CNAME answer was observed; that alone is not a full test of www routing. DMARC policy and www behavior need separate decisions and verification.

Receiving MX records do not provide a completed shared inbox. This application has no implemented inbox, receiving webhook pipeline, permanent conversation archive, or agent mail-review access. A future receiving service must have separate credentials and controlled access; do not upgrade the public notification backend to a full-access key.

## Implemented access and remaining simulations

Real D1-backed functions: invited owner accounts/passwords/sessions, visitor email-code verification, rate limits, audit records and the visitor-demo switch. Owners have equal dashboard permissions; the last active owner is protected. The initial production owner completed password setup and login. Do not document its initial invited status as its current state.

Visitor codes have eight digits, ten-minute expiry and five attempts. Current controls include a 60-second resend cooldown, 10 sends per IP/hour, 10 messages per recipient/hour and 100 messages globally/day. Owner mail shares applicable mail limits. Exact visitor domains ignore case but exclude subdomains/lookalikes; explicit-address exceptions are also supported. Owner setup/reset delivery instead requires an invited or active owner record. Browser requests cannot choose owner-mail privileges.

The database-backed visitor-demo switch is initially off on fresh installation; its current value is owner-controlled and must not be reset by deployments. Off blocks visitor sending, verification and demo access while preserving owner login and existing records.

The 0.4.0.0 source candidate adds shared D1 availability with migration 0005; it has not been applied remotely by this batch. See [calendar availability](calendar-availability.md) for the migration review and release checks. Migration 0006 adds visitor-provided profiles and real pending requests, approvals and cancellations. Identity/agent checks, the separate sample dashboard, conversation examples and lockbox actions remain simulations. Sending/receiving DNS verification does not change that scope. Migration 0007 adds a live owner showing calendar, durable approval/cancellation notifications and owner-initiated email for upcoming pending/approved requests. Retention cleanup, broader anti-abuse capacity, inbox delivery/bounce tracking and backup policy remain follow-up work.

## Recovery or new-project sequence

1. Recover authorized GitHub/Cloudflare/Resend access through the private inventory. Verify identities and repository origin; never copy another contributor's login credentials.
2. Select a known-good source commit/tag and install locked dependencies using the repository's Node/npm requirements. Tags identify source, not database backups or proof of deployment.
3. Inventory surviving Workers, databases, secrets and DNS before creating replacements. Preserve existing data where repairing this installation. For a new project, provision new resources and replace account/Worker/database/origin guards and configured sender identities throughout source and tests.
4. Restore each database from an approved backup, or explicitly accept an empty installation and apply reviewed migrations. Check schema compatibility with the chosen source before deployment. Never restore dev records into production by accident.
5. Restore or deliberately rotate each environment's secrets; reissue provider/build credentials where needed. Verify Resend domain records and configure exact origins/bindings. Record rotation impacts and account recovery ownership privately.
6. Recreate Git build settings and equivalent repository protections from the sections above. Test shared dev first, including persistence across a second build. Keep production routing changes separately authorized.
7. For an empty environment only, follow reviewed first-owner provisioning in [auth setup](auth-setup.md). Existing installations use password recovery or an explicit operator recovery procedure, not a new public bootstrap path.
8. Apply approved production migrations and promote reviewed code through the protected PR process. Verify checks, live identity and authentication. Do not assume a code rollback restores a database or an older credential.
9. Record backup locations, restore test results, final resource IDs, token scopes and verification date. A successful fresh installation is not proof of successful data recovery.

## Verification checklist

- GitHub: PR head/base, required checks and review, conversations resolved, protection rules unchanged.
- Dev: exact deployed `/version.json` commit; dev snapshots may have a different SHA from the feature with the same tree. Validate mail, owner access and retained records using approved accounts.
- Production: successful Cloudflare check on actual main merge commit and matching `/version.json`; verify the release tag according to [versioning](versioning.md). Documentation-only merges retain the prior release tag rather than moving it.
- Confirm unauthenticated dashboard redirects to sign-in, visitor navigation has no Owner area link, and homepage footer retains Owner login. This navigation policy does not replace server-side authorization.
- Check runtime secret names and pending migrations without printing secret values. Do not send test mail, change demo settings or mutate records merely to inventory infrastructure.
- Recheck mail DNS and actual inbox delivery when changing provider configuration. API acceptance alone is not delivery confirmation.

## Local operator tooling

Static/content development commonly uses port 4321. The authenticated local Worker preview uses port 4324, local persisted D1, and the Linux user service `rockybottom-auth-preview`; restart it after rebuilding. Port 4322 was an older static preview and cannot substitute for the auth runtime. `npm run test:auth:isolated` uses disposable local D1/fake mail on port 4325.

A machine-specific supervisor workspace has review scripts and a pre-push guard; these are not GitHub protections and are not automatically installed by cloning. Keep private operator instructions outside this public repository. Other contributors need GitHub access, not local Cloudflare or Resend credentials, for ordinary Git-triggered publishing.

## Calendar migration 0005 — pending release preparation

The candidate adds `calendar_state`, `calendar_periods`, and `calendar_audit`; it does not modify or seed owners, visitors, demo settings, bookings, or legacy scaffold tables. The explicit initial state is zero available times. Browser-local examples are never imported. Dev publication applies this migration through the existing guarded dev deploy command after authorization. The remote inventory above remains historical evidence, not a claim that 0005 is deployed.

Before production promotion, separately review the SQL and [calendar policy](calendar-availability.md), capture a production D1 backup/recovery point with its timestamp and database identity, and verify restore access and a compatibility/rollback plan. No backup was taken or production migration performed during local implementation. Apply 0005 to production only as separately authorized preparation, before code requiring these tables. The migration is additive and old code can still run, but old code only shows fictional local availability; rolling code back leaves new settings/audit data intact and temporarily removes shared-calendar behavior. Do not drop the new tables or erase auth data to roll back.

After authorized dev publication: with approved existing accounts, have Owner A save a period and Owner B reload on another browser/device; verify visitor slots, add/remove a block, then verify persistence through the next authorized deployment. Local automated tests use disposable D1 and fake mail only. Remote cross-device/deployment checks remain release verification, not something local tests prove.

## Visitor booking migration 0006 — pending release preparation

The candidate adds `visitor_intake_profiles` and additive booking metadata columns/indexes. It does not reset existing visitors, owners, passwords, sessions, availability or visitor-switch settings. Existing bookings receive `unverified` validation status; they are never converted into simulated passes. Review 0005 and 0006 together and apply both before promoting this code. Use the same separately authorized production backup/recovery and compatibility preparation described above. Dev applies pending migrations only after publication is authorized.

Real requests hold slots, so code rollback to a version that ignores D1 bookings is behaviorally unsafe even though the schema is compatible. Before rollback, pause visitor booking and resolve/review existing holds with owners; preserve the database and make a deliberate recovery plan. Do not drop tables or reset accounts. [Visitor booking](visitor-booking.md) defines the new transaction and testing policy.

For controlled production testing, leave **Visitor booking settings** disabled except during an approved test window. An empty availability calendar exposes no slots; dated available periods can open only the desired test times. Recurring blocks always win and are not overridden by dated availability. Switching booking off does not delete or release existing requests; owners must cancel test requests explicitly when finished. This documentation does not change the current remote setting or authorize production publication.

## Booking notification migration 0007 — pending release preparation

Additive migration 0007 adds outbox timestamps/actor attribution and query indexes. It preserves owner/visitor/auth records, bookings, availability and the booking switch. No email is queued by the migration, and old scaffold outbox rows remain ineligible for delivery. The current local candidate requires 0005–0007; review and apply them before promoting this code. Use separately authorized production backup/recovery and compatibility preparation. No production migration, backup, publication or secret change is authorized by local implementation.

Approval/cancellation commits now include notification payloads and audit; actual sending follows commit. Interrupted actions may leave queued messages visible in dashboard email history. Retry only `pending` or preflight `failed` messages there. `uncertain` and persistent `sending` require provider inspection and authorized operator reconciliation; never reset them blindly, since an email may have been accepted. In-flight messages cannot be recalled by cancellation, disabling visitor booking or rolling back code. Older code ignores this outbox; after rollback, inspect outstanding messages rather than assuming they will send. Keep records intact. See [notification behavior](visitor-booking.md#live-owner-calendar-and-email-migration-0007).

Local acceptance checks use `npm run test:booking`, `npm run test:mail` and `npm run test:auth:isolated`, with disposable databases/fake mail. Persistent local preview can use real Resend through its ignored local settings, so do not trigger owner actions merely to test rendering. After authorized shared-dev publication, review green approved/yellow pending markers and actual email acceptance with explicitly approved test bookings; separately verify inbox receipt.
