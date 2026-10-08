# Website versioning

Agents manage versioning as part of normal work. The owner requests website changes and reviews results; they do not choose routine version numbers. `site-version.json` is the single committed release record. It holds the proposed version, release stage, exact main baseline, classification, and reason. Git history preserves previous decisions.

## Numbering rules

Before the official launch, use `0.n1.n2.n3`. This policy starts at `0.1.0.0`; earlier work is not retroactively assigned versions. At the explicitly authorized official launch, switch to `1.0.0`. Thereafter use three numbers with the same feature/update/minor meanings. These are the site's own release conventions, not a claim of package API compatibility or npm semantic versioning.

| Agent classification | Meaning | Examples |
| --- | --- | --- |
| `feature` | Substantial new capability; increase n1 and reset n2/n3 | Inquiry form, new gallery system, version tracking |
| `update` | Existing behavior, layout, security, or technical operation; increase n2 and reset n3 | Gallery bug, formatting change, dependency/security repair, build-system change |
| `minor` | Content-only change; increase n3 | Spelling, captions, text blocks, replacement photos |
| `none` | Only AGENTS.md or Markdown under docs/ changes | Workflow explanation; no website or build change |

Choose the highest applicable category in a mixed batch. A photo change that also changes gallery behavior is an update. A security repair is an update even if only a lockfile changes. When uncertain between two levels, choose the higher and explain why; do not ask the owner to manage numbering. Automated checks verify the arithmetic and declared rationale; agents and reviewers remain responsible for truthful classification of intent.

## Agent procedure

1. Fetch current main, preserve local work, and start a descriptive branch. Read this policy.
2. Make the requested change. Prepare the release with, for example:

   ```sh
   npm run version:prepare -- --level update --reason "Repair keyboard navigation in the existing gallery"
   ```

3. Run `npm run version:check`, `npm run check`, and inspect the diff. The normal build also validates the release and generates build identity automatically. Never hand-edit generated build information.
4. Keep preparing against the same main baseline while refining this batch. The operation is idempotent: repeated edits, commits, and build retries do not increment it again. Upgrade the classification if scope increases; the command refuses a downgrade within a batch.
5. If another release advances main, update this branch and prepare again against the latest main. The previous candidate number may change. Include the refreshed version in the review.
6. Submit only when instructed. After an explicitly authorized merge, verify Cloudflare production success, `/version.json`, and the GitHub source-version tag. No versioning script merges a PR or deploys the website.

Documentation-only batches still run `version:prepare -- --level none --reason "..."` to record the current baseline without changing the version. The validator rejects `none` if website files, photographs, dependencies, scripts, tests, or workflows changed. Empty retry commits keep the existing release record untouched.

## Display and lookup

- Prelaunch production: `Prelaunch 0.1.0.0 · production · abc1234`.
- Development preview: `Prelaunch 0.1.0.0 · preview · def5678`.
- Local build: `Prelaunch 0.1.0.0 · local · abc1234`, with `uncommitted` when appropriate.
- Officially launched production: only `1.0.0`. There is no build label, disclosure, branch, commit, or version hyperlink in this production footer. Its `/version.json` contains only the version value in a JSON object.

Before launch and in all non-production environments, the version disclosure includes branch and full commit; `/version.json` provides the same identifying data for verification. Cloudflare's `WORKERS_CI_COMMIT_SHA` and `WORKERS_CI_BRANCH` identify hosted builds. Local builds never claim to be production solely because their branch is main. No secrets or arbitrary environment variables are published.

GitHub tags use `site-v0.1.0.0`, then `site-v1.0.0`, etc. Find the footer's number under repository Tags to see the corresponding main source snapshot, committed release rationale, and merged PR. The workflow creates the tag on main after validation; it does not assert that Cloudflare has finished deploying. Do not move or reuse a tag. Documentation-only main updates retain the prior source-version tag. A failed build does not change the currently served footer; retries of the same source retain the number. A rollback restores the previous deployed version's number and existing source tag, rather than inventing a new release.

## Launch procedure

Only after the owner explicitly requests the official launch, run:

```sh
npm run version:prepare -- --level launch --reason "Owner-authorized official website launch" --launch-authorization "Exact owner instruction authorizing official launch"
```

This prepares `1.0.0`; it does not publish it. The recorded statement is an audit trail, not a technical way to verify that consent occurred. Agents must obtain the real instruction first. Launch content changes (real photos, listing facts, contacts, indexing, and demo notice) are separate reviewed work and are not silently enabled by versioning. Normal preview, review, and explicit merge authorization still apply.

## Automated enforcement

The Astro build integration validates the record and creates ignored `src/generated/build-info.json`. Cloudflare preview builds check the latest main; a stale baseline fails the build instead of silently duplicating a release number. The GitHub `Validate site version` job checks the exact PR base and tests numbering, stale baselines, retries, launch behavior, and tags. The main-only tag job uses contents-write permission solely to create an immutable source tag; it never pushes a main commit.

When first submitting this implementation, use the owner maintenance session: contributor Apps intentionally lack permission to modify GitHub workflows. After its check has run on GitHub, add `Validate site version` to the existing required checks while preserving the Cloudflare check and current protections. Until that remote configuration is made, the job is advisory; the already-required Cloudflare build still runs the version validator. These local workflow files do not change remote protections by themselves.

Tests use temporary local Git repositories and no network. A missing baseline history is an error, not a guessed zero version. Cloudflare retrieves missing history (including unshallowing when needed) to verify ancestry; the explicitly pinned last unversioned production commit is the sole bootstrap exception.
