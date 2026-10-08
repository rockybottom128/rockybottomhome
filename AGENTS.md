# Rocky Bottom Home — contributor workflow

## Project and scope
- Repository: https://github.com/rockybottom128/rockybottomhome
- Website repository lives in the `website` subfolder of the broader RockyBottomHome project. Run Git, npm, and build commands from this repository root. Keep unrelated project documents and source photos outside it; copy only approved website assets into `public`.
- This is an existing Astro 7 website on Cloudflare Workers Builds, not Cloudflare Pages or a Sites-managed project. Preserve its architecture, dependency lockfile, and deployment configuration.
- Production: https://rockybottomhome.com and https://rockybottomhome.accts-e61.workers.dev. Both are production destinations.
- The owner is GitHub account `rockybottom128`. Contributors use their own authorized GitHub account, never the owner's credentials.

## Local editing is the default
- Inspect repository status, current branch, origin, and applicable instructions at the start of work. Preserve unrelated/uncommitted work.
- Begin a new batch on a descriptive contributor branch from current `origin/main`, e.g. `karen/area-photo-updates`. Do not work on or push to `main` for contributor changes. Reuse the current contributor branch for follow-up edits to that batch.
- Fetch before starting; do not overwrite another person's changes or force-push. Keep commits scoped to the requested work.
- Run `npm ci` for a fresh checkout. Use a supported Node LTS release compatible with the repo (Node 22.19+ or Node 24 LTS); npm is the package manager.
- Run `npm run dev -- --host 127.0.0.1 --port 4321` for the interactive local preview. On Windows, `npm.cmd` and `npx.cmd` avoid PowerShell's npm.ps1 execution-policy issue.
- Show the actual local URL reported by the server. Keep the server running during iterative editing. Do not stop unrelated processes if a port is occupied.
- Accumulate requested edits locally. Do not push each individual edit. Commit locally when useful; remote pushes require an explicit request for the batch.

## Development publication and production boundary
- For contributor sessions, “push”, “publish”, or “deploy” refers to publishing the approved batch to a DEVELOPMENT PREVIEW and opening/updating a pull request, not production. If ambiguous, state this interpretation before acting.
- Use Cloudflare's existing Git integration: push the explicitly named contributor branch, then open/update a PR targeting `main`. Never merge the PR as a contributor. Request review from `rockybottom128`.
- NEVER push directly to `main`, force-push, merge to `main`, enable auto-merge, bypass branch protections, change production routes/DNS/domains, or run a production deploy as part of Karen's contributor workflow. Production promotion is a separate owner-controlled task after review of the exact batch.
- `npm run deploy` and `wrangler deploy` target production with this repository's current configuration. Do not run them. A different Git branch does NOT make a direct Wrangler deploy safe. Do not use `wrangler versions deploy` either.
- Contributors need no Cloudflare API token or local `wrangler login`: Cloudflare Workers Builds authenticates its own builds from GitHub.
- Expected Cloudflare configuration: Worker `rockybottomhome`; production branch `main`; build command `npm run build`; non-production branch builds enabled; non-production deploy command `npx wrangler versions upload`; Preview URLs enabled. The bare `rockybottomhome.accts-e61.workers.dev` URL is production, not dev.
- Preview URLs are prefixed version/branch hostnames provided by Cloudflare. Retrieve the exact URL from the current PR's Cloudflare bot comment/check; never guess it or reuse another batch's preview. A branch URL can change contents after later pushes; use the immutable version URL for final review.
- Development preview routing was verified during owner setup on September 12, 2026. Use that existing integration; no separate dev Worker or invented Wrangler environment is needed. If current checks indicate routing has changed or a contributor branch performs a production deploy, stop further publication and inform the owner.
- After pushing, wait for the Cloudflare check on the exact commit, require success, open/fetch the preview, verify the requested content, and return the PR and preview links. A successful Git push alone is not a successful deployment.
- Never alter the routing to fix a preview failure without a separate owner request.

## Repository onboarding
- These instructions and `.github/CODEOWNERS` travel with the repository. Contributors should clone or pull current `main`; no manual AGENTS.md installation or setup-branch cleanup is needed.
- Start contributor changes on a fresh task branch, not the historical `codex/dev-preview-setup` branch.
- See `docs/windows-setup.md` for Windows installation and authentication and `docs/family-workflow.md` for review and publishing.
- GitHub protections, not this file alone, enforce access. Do not change repository rules, collaborator roles, or credentials to bypass them.

## Validation
- Versioning is part of every batch, never an extra user request. Read `docs/versioning.md`. Fetch main, classify the highest-impact change as `feature`, `update`, or `minor`, and run `npm run version:prepare -- --level LEVEL --reason "Specific reason"`. Use `none` only for policy/documentation-only batches. Never hand-edit version numbers, increment per commit, or ask the user to select routine bumps.
- Run `npm run version:check` and `npm run test:version` with the other validation. If main advanced, update the branch and prepare against current main again before submitting. The recorded rationale is an agent decision; review it alongside the diff.
- Official launch is a separate explicit user instruction. Do not switch the release stage merely because a preview was approved or a production merge was authorized. The launch command requires that instruction recorded verbatim. After launch, production displays only the version value; previews and local builds retain diagnostic details.
- After an authorized production merge, confirm the immutable `site-vVERSION` GitHub tag points to the release's main commit and verify `/version.json` against the successful Cloudflare deployment. Tags identify source snapshots, not proof of successful deployment. Do not move existing tags or auto-merge.
- Before a batch push: `npm run build`, `npx tsc --noEmit`, `npm run test:security`, and `git diff --check` (use .cmd suffixes on Windows if needed). Inspect the diff and ensure no secrets, build output, node_modules, unrelated documents, or unapproved property information are staged.
- Test changed interactions on desktop and mobile when browser access permits: both galleries, synchronized arrows/thumbnails, swipe and keyboard navigation, enlarged photo dialog, and collapsible details/area explorer.
- Check readable text, image loading/credits, small-screen overflow, and the area explorer's spacing above the contact section. Preserve fixed row gaps; percentage row gaps previously caused content to spill onto the next section.
- If browser inspection is blocked by security policy, report the limitation without bypassing it or claiming visual verification. The user can review the local preview in their normal browser.

## Content requirements
- Keep the specific street/house address out of visible text, metadata, image descriptions, map links, and new assets while this is a demo. Rocky Bottom and Sunset, SC are acceptable.
- Keep the design-preview banner, noindex metadata, clearly marked sample home photography, and unconfirmed property/contact placeholders until the owner supplies and approves real listing information.
- Do not invent price, room counts, square footage, lot size, property amenities, contact details, travel times, or proximity claims.
- Home-gallery thumbnails have no visible text labels. The area-gallery thumbnails have destination labels and groups: Cities; Parks & forests; Lakes & rivers.
- Full home details and the area explorer start collapsed. Preserve mobile swipe, accessible labels, keyboard controls, and independent gallery state.
- Use real, relevant, reusable destination photos. Preserve source/author/license links and modification notices in `src/data/area-photos.json`; do not replace factual destination photos with generated scenes.

## File map
- `src/pages/index.astro`: homepage, property highlights, expanded home specs, contact section.
- `src/styles/home.css`: layout, responsive styling, both galleries, expandable sections.
- `src/scripts/gallery.ts`: home-photo gallery, enlarged view, swipe/keyboard navigation.
- `src/components/AreaExplorer.astro`: collapsible destination gallery and its independent controls.
- `src/data/area.ts`: destination order, groups, descriptions, visitor links.
- `src/data/area-photos.json`: destination images, credits, licenses.
- `public/area/`: reusable destination photos. `public/`: other public assets.
- `astro.config.mjs`, `wrangler.json`, `package.json`: build/deployment configuration; not routine content-edit targets.

## Credentials and permissions
- Karen signs into GitHub herself in her browser through `gh auth login`; never request passwords/tokens in chat or save them in source, AGENTS.md, shell history, or logs.
- Git commit author name/email is configured separately from authentication. Ask Karen for her desired name and verified GitHub email (or GitHub-provided noreply address); use repository-local settings.
- Stored gh authentication belongs to the Windows user environment, not one chat or one app. Do not claim it is Codex-exclusive. Existing terminal credentials can be used only within the user's authorized task.
- Use normal project-scoped sandbox permissions; request narrow approval for necessary network/install/Git operations. Do not disable security protections or request unrestricted access just for this website.
