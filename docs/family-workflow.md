# Website updates and development previews

Repository: https://github.com/rockybottom128/rockybottomhome. Production: https://rockybottomhome.com.

## Setup

Read [Linux development access](linux-development-access.md) for Scott and Karen's laptop setup, [Windows setup](windows-setup.md) for Windows contributor machines, and [AGENTS.md](../AGENTS.md) for contributor instructions. GitHub clones include the instructions automatically. Each Linux account uses its own development App credentials and checkout. The owner's GitHub login belongs in a separate production-approval session. Shared ChatGPT materials do not synchronize repository files or grant GitHub access.

## Local editing

Clone into a `website` subfolder, open that repository as the local project's primary folder, install with `npm ci`, and start `npm run dev -- --host 127.0.0.1 --port 4321`. Use native Windows PowerShell and `.cmd` command suffixes if needed. Create a task branch from current `origin/main`, collect changes locally, and wait for explicit approval of a batch before pushing. If another local preview already uses that port, use another available port and report the actual URL; do not stop the other user's server.

## Cloudflare routing

The existing `rockybottomhome` Worker uses Workers Builds (not Pages). Main builds production; non-production branches use `npx wrangler versions upload` with Preview URLs enabled. The build command is `npm run build`. Repository root is the Cloudflare build root; the local `website` parent layout does not change that. The bare `rockybottomhome.accts-e61.workers.dev` hostname is also production. Development previews have prefixed version/branch hostnames supplied by Cloudflare.

The development preview path was verified separately from production during setup. Do not use direct `wrangler deploy` commands for contributor changes. Cloudflare authenticates its own Git-triggered builds; Karen needs no local Cloudflare credentials.

## Contributor submission

1. Run the build, TypeScript check, and `git diff --check`; inspect relevant desktop/mobile behavior and staged changes.
2. Commit and push only the approved contributor branch, never main.
3. Open/update a pull request targeting main and request `rockybottom128` review. Do not merge or enable auto-merge as a contributor.
4. Wait for the exact commit's successful Cloudflare check. Retrieve and verify the preview URL from its PR comment/build details; never invent a URL. Return the PR and version-preview links.
5. Iterate on that branch until the owner approves. New pushes may dismiss prior approvals.

## Owner publishing and protections

The owner reviews the exact proposed batch and separately authorizes its merge into main. Cloudflare then updates production. Verify its successful build and website before reporting completion.

Main requires a review and code-owner review and dismisses stale approvals. The Production updates by owner ruleset restricts main updates to administrators through pull requests. The Production requires reviewed workflow ruleset requires a pull request, a successful Cloudflare build on up-to-date code, and resolved review conversations; it also blocks deletion and force pushes and has no bypass actors. CODEOWNERS names `rockybottom128` for all files.

Scott's and Karen's development Apps have contents/pull-request write access and checks/statuses read access, but no administration permissions and no production-rule bypass. The App identity is separate from the owner, so `rockybottom128` can review and approve proposals submitted through either App. The owner's credentials must not remain in the everyday development accounts after the App setup is verified. Owner-authored historical setup PRs are a different case: GitHub does not allow self-approval. Any owner exception to the classic review rule is a separate explicitly authorized action; the pull-request and build rules still apply. Do not weaken protections to make a merge work.
