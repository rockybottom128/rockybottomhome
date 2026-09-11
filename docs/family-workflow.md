# Website updates and previews

## Shared materials and account access
The shared ChatGPT project holds photos, draft text, and decisions. It does not grant GitHub permissions or automatically synchronize files with this repository. Each contributor needs their own GitHub account with repository write access, their own ChatGPT/Codex login, and a Codex cloud environment connected to this repository. Do not share the owner's credentials. Cloudflare credentials are not needed in contributor chats: the existing Git integration does the builds.

Configure the cloud environment with Node.js 22 or later and npm ci as its setup command. Begin on the latest main branch after this setup pull request is merged.

## Cloudflare settings
This site uses Workers Builds, not Pages. In the rockybottomhome Worker:
- Production branch: main.
- Build command: npm run build.
- Production deploy command: retain the existing working command (normally npx wrangler deploy).
- Enable Builds for non-production branches.
- Non-production deploy command: npx wrangler versions upload.
- Enable Preview URLs under Settings > Domains & Routes; wrangler.json also sets preview_urls to true.

Each uploaded version has a preview link. Use the exact version link when approving a change, as subsequent updates can change a branch alias. Previews are public unless Cloudflare Access is configured. Production remains rockybottomhome.com.

## Contributor workflow
1. Add requested photos and text to the shared project.
2. Start a Codex cloud task connected to this repository. Supply the selected assets and desired changes.
3. Ask Codex to follow AGENTS.md, work on a new branch, validate, and open a pull request to main.
4. Find the preview link in the Cloudflare build/check details or pull request comment. Review it from a laptop or phone.
5. Ask for follow-up changes on the same branch until ready.

## Owner review and publishing
Review the preview and changed files. The owner approves the family member's pull request, then merges it to main. Cloudflare builds main and updates production. Verify the production build and public site after the merge. Owner-authored setup pull requests cannot be self-approved, so the repository administrator can use the retained administrator override after review.

Branch protection requires one approval and dismisses stale approvals after new commits. CODEOWNERS, once merged to main, makes rockybottom128 the required reviewer for all files. Give family contributors ordinary write access, not admin access. The active Production updates by owner ruleset restricts updates to main to repository administrators (currently only rockybottom128), so ordinary contributors cannot merge to production even after approval.

## First preview test
The setup branch includes /dev-preview-check.txt with marker ROCKYBOTTOM-DEV-PREVIEW-20260911. Verify that marker on the preview host and confirm that production does not contain it before merging. Remove this temporary test file from the pull request after successful testing and before production approval.

## Remaining setup checks
Confirm the Cloudflare settings above, confirm a preview build from a GitHub push, test a task from the contributor's own Codex account, and merge CODEOWNERS to activate the named-reviewer rule. A shared project invitation alone does not complete these checks.
