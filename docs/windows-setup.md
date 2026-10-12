# Windows contributor setup — unverified starting guide

Updated October 11, 2026 to align with the current repository workflow. This guide has **not been exercised on an actual Windows PC**. Scott and Karen currently use separate Linux accounts on the MacBook Air; follow [Linux development access](linux-development-access.md) there. Do not apply the personal-account authentication below to their existing Linux App installations.

`AGENTS.md`, [family workflow](family-workflow.md), [versioning](versioning.md) and [the environment runbook](environment-runbook.md) govern current work. This guide covers proposed Windows onboarding; it is not evidence that a Windows installation, authenticated local preview or publishing workflow has passed testing.

## Inspect tools and choose a checkout

Use a native Windows terminal such as PowerShell. Check installed Git, GitHub CLI, Node and npm before installing anything:

```powershell
git --version
gh --version
node --version
npm.cmd --version
```

Use the repository's current dependency lockfile and Node requirements. Install only missing compatible tools through their official distribution channels. Do not globally install Astro/Wrangler or upgrade dependencies just for onboarding. Reopen the terminal after installation and verify its PATH. Use `npm.cmd` and `npx.cmd` when PowerShell blocks the corresponding .ps1 launchers; do not disable execution-policy protections globally.

Keep the Git checkout in a `website` subfolder of a chosen local project directory, with unrelated notes/photos outside it. Check for an existing checkout first and preserve its files. Inspect whether Documents is redirected to a sync service before choosing that location. Clone the expected repository only when needed:

```powershell
git clone https://github.com/rockybottom128/rockybottomhome.git website
Set-Location website
```

Read the cloned `AGENTS.md`. Shared chat/project materials do not create a checkout or grant GitHub access.

## Authentication and commit identity

For a new Windows personal-account setup, use the contributor's own GitHub account with ordinary repository write access, never the owner's. Inspect any existing authentication first. If this machine already has a separately provisioned App setup, preserve it and use its procedure instead.

For an approved personal-account installation:

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
gh auth status
gh api repos/rockybottom128/rockybottomhome --jq '.permissions'
```

The user completes browser authorization themselves, checking the account shown. Read-only verification should confirm the intended identity and repository write access without administration rights. Diagnose denied access instead of switching to owner credentials. Do not copy Linux App profiles, private keys, tokens or another user's credential files. Do not paste authentication secrets into chat or source.

Git commit attribution is separate. Ask for the contributor's chosen name and verified or GitHub noreply email, then configure those values repository-locally. Do not guess them. Authentication belongs to the operating-system user environment, not exclusively to one chat or app.

## Start work and review locally

After access verification, preserve existing changes and fetch current history. Start a descriptive contributor branch from origin/main. Example for a new Karen batch:

```powershell
git fetch origin
git switch -c karen/describe-the-change origin/main
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 4321
```

Choose a real task name; reuse its branch for follow-up edits. Use the local URL actually printed and keep the preview running during review. Select another port if occupied without stopping unrelated processes. Diagnose dependency errors rather than deleting the lockfile or making broad upgrades.

This static preview is not proof of the authenticated database-backed workflow. See [auth setup](auth-setup.md) for those requirements. Some local scripts use POSIX-style environment assignment and the documented Linux service does not exist automatically on Windows. Validate Windows compatibility in the future setup task; do not claim those commands work unchanged or change hosting/database settings to work around a local problem.

## Approved batch publication

Follow the current family workflow rather than historical branch-only preview instructions:

1. Accumulate edits locally. Prepare version metadata and run all checks required by `AGENTS.md` and [versioning](versioning.md), using .cmd launchers as needed. Inspect the diff and relevant desktop/mobile behavior.
2. Commit only intended work. Only after explicit batch publication approval, run `npm.cmd run publish:dev -- --publish` from the contributor branch. Its Windows execution remains to be verified; diagnose failures without substituting force pushes or direct deployments.
3. The publishing workflow sends the feature branch and exact source tree to permanent dev, retaining dev history and database contents. The shared authenticated site is `https://rockybottomhome-auth-dev.accts-e61.workers.dev`. Verify its build, source tree and live `/version.json`, plus the feature's separate production-Worker preview check.
4. Open/update a feature-to-main PR only when authorized; leave PR creation to the user when requested. Never create the production PR from dev. Return the actual review links.
5. Production promotion requires separate owner-controlled review and merge through GitHub's protected PR workflow. Contributors must not merge, enable auto-merge, bypass protections, push main or run direct Cloudflare deploy commands.

The production Worker remains `rockybottomhome`, serving `https://rockybottomhome.com` and its bare workers.dev hostname. Its version previews are separate from the shared authenticated dev Worker. Preserve existing Cloudflare integration, secrets, GitHub protections and deployment rules. No local Cloudflare credentials are needed for ordinary Git-triggered publication.

## Local safeguards and verification limits

Git hooks are local and not installed by cloning. Inspect effective hooksPath, common Git directory, worktrees and any existing pre-push guard. Preserve unrelated checks. The intended guard allows approved new/fast-forward dev and contributor-branch updates only in the expected repository and rejects main, deletions, tags, rewrites and other destinations. Validate any local correction without remote test pushes. A hook does not enforce PR merge or Cloudflare permissions, establish human approval, or prevent deliberate bypass.

Before declaring Windows setup complete, verify tool versions, intended identity/access, commit attribution, clean branch setup, locked installation, local rendering and required checks. Report untested authenticated-preview or publishing steps explicitly. Do not publish merely to complete onboarding without separate approval. Preserve application behavior and content using current repository instructions rather than the obsolete original design snapshot.
