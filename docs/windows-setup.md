# Karen's Windows setup — Rocky Bottom Home

Prepared September 12, 2026. Send this guide to Karen. Attach this guide to a new Codex chat on her Windows computer. AGENTS.md comes with the GitHub clone automatically. The chat can help perform the setup, but Karen completes GitHub/browser sign-in herself.

## Paste this request into Karen's new chat

> Help me configure this Windows computer to edit the existing Rocky Bottom Home website. Read the attached setup guide, then read AGENTS.md from the cloned repository. I have my own GitHub account with write access to https://github.com/rockybottom128/rockybottomhome. Use my account, not the owner's. Inspect installed tools first, install missing Git for Windows, GitHub CLI, and a compatible Node.js LTS with npm, and guide me through browser authentication. Keep the repository in a website subfolder within my chosen RockyBottomHome project folder, separate from unrelated project materials. Configure my repository-local Git author identity using the name/email I provide. Start a local preview and help me iterate on changes locally. Do not push each edit. Publish only an explicitly approved batch to a contributor branch and Cloudflare development preview, with a pull request for rockybottom128 to review. Never push or merge to main or deploy production. Use the existing verified Cloudflare non-production preview integration and check the build for every pushed batch. Do not recreate or redesign the site or migrate hosting. Tell me when my local preview is ready, and explain any setup step I need to complete myself.

## What this project is

- A for-sale-by-owner website for a small, modern, new construction mountain home in Rocky Bottom, Sunset, South Carolina.
- GitHub repository: https://github.com/rockybottom128/rockybottomhome
- Public production site: https://rockybottomhome.com
- Hosting: Cloudflare Workers Builds connected to GitHub, not Cloudflare Pages.
- Existing stack: Astro 5.16.9, TypeScript, plain CSS, npm, Cloudflare adapter, locally installed Wrangler. Use the repository's locked dependency versions. Do not install Astro/Wrangler globally or upgrade the stack just to set up Windows.
- Default branch: main. All website batches from the original editing session were published; latest website commit verified was `0a61736`. Fetch current GitHub state rather than assuming this remains the latest.
- Scott's repository now lives at `/home/scott/Documents/ChatGPT/RockyBottomHome/website`. That Linux path is context only; do not use it on Windows.
- The old hidden ChatGPT workspace is no longer the working checkout. A shared ChatGPT project or chat does not clone/synchronize Git files or grant GitHub access.

## 1. Tools and environment

Use the Windows-native Codex agent and PowerShell. WSL, Docker, Python, a global Codex CLI installation, VS Code, and a Cloudflare plugin are not required for the normal website workflow. Sign into the desktop app with Karen's own ChatGPT/Codex account and complete its normal Windows sandbox setup.

Check what is already installed:

```powershell
git --version
gh --version
node --version
npm.cmd --version
```

Install only missing tools. Official Windows installation commands for Git and GitHub CLI:

```powershell
winget install --id Git.Git -e --source winget
winget install --id GitHub.cli -e --source winget
```

Install Node.js using the official Windows LTS installer from https://nodejs.org/en/download. Node 24 LTS is a suitable default; a current Node 22 LTS release at least 22.19 also works with the locked dependencies. npm comes with Node. Choose the installer for the machine architecture; enable its normal PATH integration. Existing compatible installations can be reused.

If WinGet is unavailable, use the official Git for Windows and GitHub CLI installers linked in Sources below. Installation may need Windows approval or administrator credentials. After installing, close/reopen the terminal and restart the desktop app so both see the updated PATH. Repeat the version checks from Codex's own terminal/environment.

Use `npm.cmd` and `npx.cmd` in PowerShell if npm.ps1 is blocked by execution policy. Do not disable PowerShell security globally to solve this.

## 2. Karen's own GitHub authentication

Run in the Windows environment that Codex will use:

```powershell
gh auth login --hostname github.com --git-protocol https --web
```

Choose Yes if asked whether to authenticate Git. The one-time device code is printed in the TERMINAL, not in an existing GitHub website tab. Open the displayed GitHub link, enter that code, and confirm the browser is signed into Karen's own account. Complete the authorization and return to the terminal.

Then:

```powershell
gh auth setup-git
gh auth status
gh api repos/rockybottom128/rockybottomhome --jq '.permissions'
```

The account should be Karen's and `push` should be true. A pending collaborator invitation must first be accepted. Karen needs ordinary repository write access, not admin access. Do not sign her into `rockybottom128` to get past a permission error.

GitHub CLI stores reusable authentication for the Windows user; it is not exclusive to this chat or Codex. We discussed repository-limited tokens and GitHub Apps, but did NOT configure them. Do not copy Scott's tokens, Linux keyring, ~/.config/gh, or Git credential files. No token or password should be pasted into the chat or repository. A browser login alone is not CLI authentication.

## 3. Folder layout and clone

Keep general project files outside the Git repository. Example native Windows layout:

```text
C:\Users\<Karen's Windows user>\Documents\RockyBottomHome\
    website\       <-- Git repository and all website commands
    Karen-setup\   <-- these handoff files, optional
    photos\        <-- optional originals, outside Git
    notes\         <-- optional project documents, outside Git
```

Use a chosen local folder; Documents may be redirected to OneDrive, so confirm the actual location or choose a nonsynced local folder. Avoid a nested `website\website` checkout. Do not initialize the broad project folder as a Git repository.

Example PowerShell setup (adjust the project folder before running):

```powershell
$projectDir = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'RockyBottomHome'
New-Item -ItemType Directory -Force -Path $projectDir | Out-Null
Set-Location $projectDir
git clone https://github.com/rockybottom128/rockybottomhome.git website
Set-Location website
```

If the destination already exists, inspect it first instead of overwriting or cloning again. The clone includes `website\AGENTS.md`. Codex reads it as repository instructions; no separate download or copying step is needed. Pull current changes before starting a new batch.

In the desktop app, open/add `website` as the local project's primary folder so Git and AGENTS.md are discovered there. Add the broader project folder as an additional folder only if needed for reference materials. Alternatively, if the parent is primary, put a short AGENTS.md there instructing Codex to read `website/AGENTS.md` and run website commands in `website`. Never assume an uploaded shared-project source is automatically a live repository file.

## 4. Commit identity is separate from sign-in

Ask Karen for her preferred commit author name and the email shown in her GitHub email settings (a GitHub-provided noreply address is fine). Configure only this repository, substituting her actual values:

```powershell
git config --local user.name "KAREN'S CHOSEN NAME"
git config --local user.email "KAREN'S VERIFIED OR NOREPLY EMAIL"
git config --local user.name
git config --local user.email
```

Do not run those placeholder values literally and do not invent her email. `gh` authenticates remote operations; Git itself makes local commits and uses this separate identity.

## 5. Start a contributor branch and local preview

For new website work, branch from current main; do not edit the historical setup branch. Example branch name, to be chosen for the real task:

```powershell
git fetch origin
git switch -c karen/first-website-edits origin/main
npm.cmd ci
npm.cmd run dev -- --host 127.0.0.1 --port 4321
```

Open the exact local address printed by Astro, typically http://127.0.0.1:4321. Leave that terminal running. Use another terminal for Git commands. If the port is occupied, inspect the existing preview or select an unused port; don't terminate unrelated programs. Astro refreshes the preview as source files change.

If installation fails because of network/sandbox access, approve only the needed network/install operation. If npm reports a lockfile mismatch, diagnose before changing dependencies; do not delete the lockfile or run broad upgrades as a workaround.

## 6. The production-safe development path

### Verified current architecture

There is ONE Worker, `rockybottomhome`, with separate production and preview versions. There is not a verified separate `rockybottomhome-dev` app.

- Production custom domain: https://rockybottomhome.com
- Production workers.dev address: https://rockybottomhome.accts-e61.workers.dev
- Development previews: prefixed version/branch URLs supplied by Cloudflare.
The owner setup introduced repository instructions, CODEOWNERS, and `preview_urls: true`. Contributors start from current main; no setup PR cleanup is required. A development-only marker was successfully tested on a Cloudflare version preview while production returned 404; the temporary marker was then removed. Historical preview links are not Karen's preview links: retrieve her actual URL from her PR's Cloudflare bot comment.

Cloudflare Workers Builds settings must remain:

- Repository: `rockybottom128/rockybottomhome`; root directory is the repository root, NOT `website` (the local parent layout does not change the GitHub layout).
- Production branch: `main`.
- Build command: `npm run build`.
- Production deploy command: retain its working configuration; owner-controlled only.
- Non-production branch builds enabled.
- Non-production deploy command: `npx wrangler versions upload`, NOT `wrangler deploy`.
- Preview URLs enabled; preserve the corresponding repository configuration after setup is merged.

Karen does NOT need a Cloudflare token or local Cloudflare login. GitHub pushes trigger Cloudflare's existing integration. A different Git branch alone does not protect production if someone directly runs `npm run deploy` or `wrangler deploy`.

### Normal edit/review cycle

1. Work locally on a contributor branch; let Karen give several rounds of edits before pushing.
2. Before publication, run `npm.cmd run build`, `npx.cmd tsc --noEmit`, and `git diff --check`. Review desktop/mobile behavior where browser access is available.
3. Inspect/stage only the intended changes. Commit with Karen's identity.
4. Only after Karen explicitly approves publishing the batch to development, push that named contributor branch (never main), then open a PR targeting main and request `rockybottom128` review. Creating a PR does not merge it.
5. Wait for the exact commit's Cloudflare check. Retrieve the actual preview URL from the PR bot comment or build details; verify it displays the changes. Share the PR and preview links with Scott manually unless Karen explicitly authorizes sending a message.
6. Continue follow-up changes on the same branch. New pushes update the branch preview and can invalidate previous approvals.
7. Scott reviews and separately authorizes/merges the PR to main. That merge triggers production. Karen's Codex must never use an admin bypass or merge/push to main as a contributor.

GitHub protections checked September 12: main requires one review, stale approvals are dismissed, and code-owner review is enabled. An active `Production updates by owner` ruleset restricts main updates/deletion/non-fast-forward operations, with repository-administrator bypass. The repository includes CODEOWNERS naming `rockybottom128` as the reviewer for all files. Re-check settings if access changes. AGENTS.md is agent guidance, not a replacement for these server-side controls.

GitHub CLI 2.45 on Scott's machine hit an obsolete Projects API error for `gh pr view --comments`. If Karen sees that, update GitHub CLI or read comments through `gh api repos/rockybottom128/rockybottomhome/issues/PR_NUMBER/comments`; do not change repository permissions to fix it.

## 7. Design and content decisions to preserve

- Modern mountain-home styling: dark forest/charcoal, light background, large photography. One scrolling Astro page.
- Navigation: The home, Photos, The setting, Contact the owner.
- Demo privacy: no specific house number/address, precise map link, or hidden address metadata. Rocky Bottom / Sunset SC are allowed.
- Keep sample-home image labels, design-preview banner, and `noindex` until the owner approves a real listing. Price, beds/baths, square footage, lot size, owner contacts remain unconfirmed placeholders.
- The Home: four quick facts with a collapsed “View full home details” section below them.
- Home photos: currently three labeled crops of one inspiration photo, not actual property photos. Image-only thumbnails with no visible thumbnail captions; synchronized next/previous arrows, swipe, keyboard, and enlarged dialog.
- The Setting introduction includes “Between Pickens, South Carolina, and Brevard, North Carolina.” and “Along that route is Rocky Bottom: a historic tiny neighborhood with a mountain creek, wildlife, and a character all its own.” Neighborhood text: “Rocky Bottom - South Carolina.”
- Area explorer: collapsed beneath the setting intro, photo plus short text/official links and credits. Thumbnails DO have text and are grouped: Cities (Brevard, Greenville, Asheville); Parks & forests (Table Rock, Pisgah National Forest, Caesars Head); Lakes & rivers (Jocassee & Keowee, French Broad River).
- Destination photos are real reusable photos stored in `public/area`; author/source/license/modification notices are recorded in `src/data/area-photos.json`. Brevard's photo is archival; the lake photo depicts Jocassee, not both lakes.
- Preserve the spacing fix above the green contact section: fixed grid row gaps, not percentage row gaps. Do not allow area helper text to overflow onto the next section.
- Owner contact section is not a working inquiry form. Do not imply submissions/tour requests are collected.

## 8. Permissions and troubleshooting

- Grant Codex read/write access to the chosen project folder, normal terminal execution, necessary package/GitHub network operations, and loopback preview access. Keep normal sandbox/approval protections.
- Approve Windows installation prompts when installing trusted tools. Do not run all work as administrator or grant unrestricted filesystem/network access just to make this site work.
- Local Git commits need no network; pushes need Karen's GitHub login and repository permission. A shared ChatGPT invitation and GitHub invitation are separate.
- If an admin-enforced browser policy blocks Codex inspection, do not bypass it or switch to hidden automation. Karen can review the local site in her browser; Codex should honestly report the verification limit. Earlier Linux browser inspection was blocked even while previews worked for Scott; this may not occur on Windows.
- Never put tokens/keys in AGENTS.md, `.env` committed to Git, shared chat files, URLs, scripts, or shell command history. No changes to Scott's authentication are needed.

## 9. Setup completion checklist

- Git, gh, Node, and npm run from the same Windows environment as Codex.
- gh reports Karen's account and repository push access; commit author identity is Karen's.
- Repository is in the `website` subfolder; AGENTS.md was obtained from GitHub in that repository root.
- Karen is on a contributor branch, not main, and understands batch publishing.
- npm ci succeeds; local preview renders; build/type checks pass.
- Preview branch mapping and owner protections are confirmed before any push.
- No production push, merge, deployment, DNS change, or credential sharing occurred during setup.

## Official sources

- [Windows desktop app, native agent and terminal guidance](https://learn.chatgpt.com/docs/windows/windows-app)
- [Local projects and primary folders](https://learn.chatgpt.com/docs/projects)
- [Git for Windows installation](https://git-scm.com/install/windows)
- [GitHub CLI Windows installation](https://github.com/cli/cli/blob/trunk/docs/install_windows.md)
- [GitHub CLI browser authentication](https://cli.github.com/manual/gh_auth_login)
- [Git credential helper setup](https://cli.github.com/manual/gh_auth_setup-git)
- [Node.js official downloads](https://nodejs.org/en/download)
- [Cloudflare Workers Builds branch configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
