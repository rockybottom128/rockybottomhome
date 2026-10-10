# Website updates and development previews

Repository: https://github.com/rockybottom128/rockybottomhome. Production: https://rockybottomhome.com.

## Setup

Read [Windows setup](windows-setup.md) for Karen's local machine, and [AGENTS.md](../AGENTS.md) for contributor instructions. GitHub clones include the instructions automatically. Use individual GitHub accounts with ordinary repository write access; never share the owner's credentials. Shared ChatGPT materials do not synchronize repository files or grant GitHub access.

## Local editing

Clone into a `website` subfolder, open that repository as the local project's primary folder, install with `npm ci`, and start `npm run dev -- --host 127.0.0.1 --port 4321`. Use native Windows PowerShell and `.cmd` command suffixes if needed. Create a task branch from current `origin/main`, collect changes locally, and wait for explicit approval of a batch before pushing.

## Shared development site

After committing an approved batch on `rockyadmin/*`, `karen/*` or `scott/*`, run
`npm run publish:dev -- --publish`. This publishes the feature branch and its exact
contents to permanent `dev`, which builds the existing shared site at
https://rockybottomhome-auth-dev.accts-e61.workers.dev. Its database and credentials
persist across batches. Test one batch at a time and verify the completed build.

The owner must first set the dev Worker build branch to `dev` once, as described in
[auth setup](auth-setup.md#automatic-development-builds). No per-batch Cloudflare
setting changes or contributor Cloudflare credentials are needed afterward.
Open production PRs from feature branches, never from dev. If the owner plans to
create the PR on another computer, publish and report the branch without creating
a PR here. Production continues through separately approved merges to main.

## Cloudflare routing

The existing `rockybottomhome` Worker uses Workers Builds (not Pages). Main builds production; non-production branches use `npx wrangler versions upload` with Preview URLs enabled. The build command is `npm run build`. Repository root is the Cloudflare build root; the local `website` parent layout does not change that. The bare `rockybottomhome.accts-e61.workers.dev` hostname is also production. Development previews have prefixed version/branch hostnames supplied by Cloudflare.

The development preview path was verified separately from production during setup. Do not use direct `wrangler deploy` commands for contributor changes. Cloudflare authenticates its own Git-triggered builds; Karen needs no local Cloudflare credentials.

## Contributor submission

1. Run the build, TypeScript check, and `git diff --check`; inspect relevant desktop/mobile behavior and staged changes.
2. Commit the approved batch and use `npm run publish:dev -- --publish`; never push main.
3. Open/update a pull request targeting main and request `rockybottom128` review. Do not merge or enable auto-merge as a contributor.
4. Wait for the exact commit's successful Cloudflare check. Retrieve and verify the preview URL from its PR comment/build details; never invent a URL. Return the PR and version-preview links.
5. Iterate on that branch until the owner approves. New pushes may dismiss prior approvals.

## Owner publishing and protections

The owner reviews the exact proposed batch and separately authorizes its merge into main. Cloudflare then updates production. Verify its successful build and website before reporting completion.

Main requires a review and code-owner review, dismisses stale approvals, and has an active Production updates by owner ruleset restricting updates to repository administrators. CODEOWNERS names `rockybottom128` for all files. Keep contributors at ordinary write access. Owner-authored setup changes cannot be self-approved; a permitted administrator override can be used only for a separately authorized owner task, never for contributor publishing. Do not weaken or remove protections to make a merge work.
