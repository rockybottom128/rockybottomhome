# Scott and Karen's Linux development access

Both everyday laptop accounts follow the same process:

1. Start a descriptive branch from the latest `origin/main`.
2. Make and review changes locally, accumulating a batch.
3. Ask to submit the batch for Scott's review. Validate, push the branch, and open a pull request.
4. Wait for Cloudflare's successful check and review the immutable version URL for that commit.
5. In a separate owner session, `rockybottom128` approves and merges. Check the resulting production build and website.

The repository remains public. Neither local approval nor submitting a pull request publishes to production.

## Identities and permissions

The intended laptop configuration uses a separate private GitHub App for each Linux user, installed only on `rockybottom128/rockybottomhome`. Each App requests:

| Permission | Access |
| --- | --- |
| Contents | Write |
| Pull requests | Write |
| Checks | Read |
| Commit statuses | Read |
| Metadata | Read |

Neither App has administration or workflows permission, or an entry in any production-rule bypass list. Repository rules, rather than the token permission alone, block updates to `main`. Contents write by itself also permits the merge API, so those production restrictions must remain active. If a change to workflow automation is needed, submit it through a separately authorized maintenance session.

Private keys do not expire automatically. Installation tokens expire after one hour. The helper generates fresh tokens as needed, five minutes before cached expiry, so users do not sign in hourly. Tokens are additionally narrowed to this one repository. Each user's key and cache stay outside Git in `~/.config/rockybottom-development/active`, with private file permissions.

## Initial installation

An owner first registers and installs each App using the one-time local registration page. The page stores credentials outside the website. Registration alone is not installation: on GitHub, install each App using **Only select repositories → rockybottomhome**.

The per-user installer copies the matching App profile, helper, and launcher into that user's home. It refuses mismatched profiles and existing different files. Karen receives her own copy of the already-verified Node 24 distribution rather than depending on Scott's home. Do not copy Scott's personal GitHub CLI credentials or browser profile to Karen.

Karen's home on this laptop is encrypted with eCryptfs. She must log into her Linux desktop with her password before installation; `findmnt -T /home/karen -o TARGET,FSTYPE` must show `/home/karen` and `ecryptfs`. Keep her logged in if Scott performs the installation from another session. Running commands through `sudo -u karen` does not necessarily unlock her home. Do not change a locked home folder's permissions to make installation proceed: that can put files beneath the encrypted mount, where they disappear from view after login. The installer stops unless the encrypted home is mounted.

After installation, restart the desktop app or refresh its command path. Confirm access with:

```sh
rockybottom-auth verify
gh auth status
gh api repos/rockybottom128/rockybottomhome --jq .full_name
```

Run these checks in a newly opened Terminal in the actual user's desktop, not only inside the installer. On this laptop, Karen's approved commit identity is `Karen <328162498+kashleyh@users.noreply.github.com>`.

The `gh` launcher uses the system GitHub CLI with a freshly supplied App token. GitHub App installation tokens do not represent a human user, so `gh api user` is not an authentication test for this setup. Some CLI operations that assume a human viewer may need their REST equivalent through `gh api`.

Configure each checkout with `rockybottom-auth configure-repo /absolute/path/to/website`. This installs the App credential helper locally, clears earlier helpers for this repository, and sets `credential.useHttpPath=true`. Configure the human's chosen author name and verified email separately. Commit attribution and authorization are different: the App submits the PR while commits retain the human author.

After testing branch push and pull-request creation, and inspecting the App's absence from production bypass lists, remove the owner's saved CLI authorization from the development account. This does not sign the owner out of other computers or browser sessions. Use a separate owner session for production approval.

## Daily use

Ask the assistant to make a change and review the local URL it supplies. When satisfied, say **“Submit this batch for Scott's review.”** The assistant returns the pull request and Cloudflare review URL. Either contributor can continue editing the same branch; further pushes require renewed review.

No contributor Cloudflare token, `wrangler login`, or direct deployment command is needed. Cloudflare authenticates its existing Git-triggered builds independently.

## Troubleshooting

- Network failure: restore connectivity and retry; do not replace App authentication with the owner login.
- Expired token: the helper renews automatically. `rockybottom-auth verify --refresh` requests a new token explicitly.
- Changed or suspended App permissions: ask Scott to inspect the installation; the helper refuses unexpected access.
- Permission denied for `main` or a merge: expected in a development session. Return the PR and review URL to Scott.
- Another person's preview occupies port 4321: start on another port and report the actual URL.
- Keys lost or revoked: the owner provisions replacement credentials; never paste keys into chat or commit them.

The registration and installation tools do not themselves prove the complete workflow is operational. Finish a real development branch/PR/Cloudflare-preview test under each App before handing off the laptop.
