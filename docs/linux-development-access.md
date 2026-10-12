# Scott and Karen's Linux contributor setup

This guide applies to the separate Scott and Karen Linux accounts on the Linux MacBook Air. Each account uses its own checkout and repository-scoped GitHub App. It supplements [family workflow](family-workflow.md); [the environment runbook](environment-runbook.md) is the reference for shared-dev and production configuration. The [Windows guide](windows-setup.md) is a separate, unverified starting point, not the authentication procedure for this PC.

## Existing installation: inspect before changing

Work in the actual person's signed-in Linux session. Identify the Linux user, checkout, branch, working-tree status, origin and effective Git configuration. Preserve existing files, commits and credentials. Do not assume another machine's checkout paths, services, hooks or setup history apply here.

Each installed account uses:

- `~/.local/bin/gh` and `~/.local/bin/rockybottom-auth` launchers.
- `~/.local/lib/rockybottom/rockybottom_auth.py` for repository-scoped authentication.
- A private App profile/key/cache under `~/.config/rockybottom-development/active`, outside Git.
- A repository-local credential helper and `credential.useHttpPath=true`.

The helper renews temporary installation tokens automatically. Each App should have exactly contents/write, pull_requests/write, checks/read, statuses/read and metadata/read access, scoped to `rockybottom128/rockybottomhome`. No administration permission or production-protection bypass is part of this setup. Human commit attribution is separate from App authentication; preserve each person's configured name and verified email.

Verify without publishing:

```sh
whoami
command -v gh rockybottom-auth
git status --short --branch
git remote -v
gh auth status
rockybottom-auth verify
gh api repos/rockybottom128/rockybottomhome --jq .full_name
```

Do not use `gh api user` to test installation tokens. Do not run `gh auth login`, `gh auth setup-git`, copy another user's authentication, or restore owner credentials to resolve a denial. Some App CLI commands require their REST equivalents through `gh api` when they assume a human viewer.

The helper needs write access to its private token lock even while a cached token is valid; renewal also writes the private cache. A sandbox read-only-file-system error can be reported by the helper as incomplete/unreadable credentials. Diagnose the underlying error and obtain narrowly scoped access for the existing helper before considering reinstallation. If a token is expired, use the established automatic renewal or `rockybottom-auth verify --refresh`; never display tokens or private keys. Reinstallation, new keys and permission changes require a diagnosed need and separate authorization.

Scott's App and single-repository access were verified on October 11, 2026. Karen's current account was not reassessed in that session. Verify her installation in her own signed-in session before claiming it works. Historical setup records describe Karen's home as encrypted with eCryptfs; inspect its actual mount before any future installation. A locked encrypted home must be unlocked through her login, not worked around with changed permissions or credential copies.

## Current contributor workflow

1. Read `AGENTS.md`, [family workflow](family-workflow.md) and [versioning](versioning.md). Fetch current origin/main after read-only access succeeds. Start a descriptive scott/* or karen/* branch from it; reuse that branch for follow-up edits. Do not merge historical setup branches merely to acquire local tools.
2. Install locked dependencies when needed and review locally. A static preview uses `npm run dev -- --host 127.0.0.1 --port 4321`; use the reported URL and preserve unrelated servers. Authenticated local testing has separate requirements in [auth setup](auth-setup.md); do not assume another PC's local service exists here.
3. Accumulate a batch, prepare its version metadata and run the checks required by `AGENTS.md`. Inspect and commit only intended changes. Local approval of appearance is not publication authorization.
4. Only after explicit batch publication approval, run `npm run publish:dev -- --publish`. It publishes the feature branch and its exact source tree as a fast-forward shared-dev snapshot. The development database persists; do not reset it. Validate migrations for any batch that introduces them.
5. Verify both the feature's production-Worker preview check and shared-dev build, source tree and live `/version.json`. Open/update a feature-to-main PR only when authorized; if the user plans to create it elsewhere, report the branch instead. Never create the production PR from dev.
6. Authorized review remains available. Production merge belongs to the owner through GitHub's protected PR workflow in a separate approval session. Do not merge, enable auto-merge, bypass protections or run direct Cloudflare deployment commands as a contributor.

Contributors need no Cloudflare secrets or configuration changes for this Git-triggered workflow. Keep Apps, GitHub protections, production deployment rules and database credentials unchanged.

## Local push guard

Hooks are machine-local and do not arrive with a pull. Inspect `git config --show-origin --show-scope --get-all core.hooksPath`, the common Git directory, linked worktrees and the effective pre-push file. An absent hooksPath means Git uses its default hooks directory; do not mistake its `.sample` files for active hooks.

Scott's checkout received a default-location pre-push guard on October 11, 2026. It allows new branches and fast-forward updates to dev and karen/*, scott/* or rockyadmin/* only at the expected repository. It rejects main, other branches, deletions, tags, history rewrites and unexpected destinations. No equivalent installation is claimed for Karen; inspect it in her session. Preserve unrelated hook checks when correcting any obsolete blanket review-only restriction. Validate changes with disposable repositories or simulated inputs, never remote test pushes.

A hook cannot establish human approval, intercept GitHub PR merges/API writes or Cloudflare commands, or prevent deliberate hook bypass. It checks ref ancestry rather than the original force flag: a redundant force flag on a fast-forward update is indistinguishable. Force flags remain prohibited by workflow. GitHub protections remain the production enforcement boundary.

## Historical tools

The preserved `scott/contributor-workflow-setup` branch contains the original registration/installation scripts and helper tests. The installed helper runs outside the checkout, so switching to a current feature branch does not remove it. Do not rerun the old registration or installer as routine onboarding: its user names, encrypted-home check and Node distribution path require machine-specific review. This guide does not authorize changes to either user's installation.
