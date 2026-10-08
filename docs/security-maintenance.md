# Astro image security maintenance

The image-processing repair upgrades Astro to 7.3.8 and all installed Sharp copies to 0.35.5. It addresses [GHSA-26w7-cxv4-gfx2](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2), which affects applications that process attacker-controlled AVIF images. The repair also updates the compatible Cloudflare and MDX integrations, Wrangler, RSS integration, and vulnerable transitive dependencies. The final local audit on October 8, 2026 reported zero known vulnerabilities; audit results can change as new advisories are published.

## Local verification

Use the repository root and Node 22.12 or newer; Node 24 is the tested runtime. Install the exact locked dependencies with `npm ci`, then run:

```sh
npm run check
npm audit
git diff --check
```

`npm run check` builds the website, type-checks it, runs the image-security regression tests, and performs a Wrangler packaging dry run. It does not deploy. The tests reject vulnerable Astro/Sharp versions, including nested Sharp copies in the lockfile, and exercise benign AVIF encoding/decoding with the installed library. They do not execute malicious images or replace the full dependency audit.

For browser review, run `npm run preview` and use its reported local URL. Check desktop and mobile galleries, thumbnails, keyboard navigation, swipe, the enlarged-photo dialog, expandable sections, image loading, and spacing above contact content. Preserve the demo notice, noindex metadata, and sample-photo labels.

## Cloudflare build compatibility

The upgraded adapter uses `@astrojs/cloudflare/entrypoints/server` in the source Wrangler configuration and generates deployment configuration during the build. Run Wrangler from the repository root after the build so it follows `.wrangler/deploy/config.json`. Do not force the source configuration with `--config` when packaging the built site. The current static site produces assets in `dist/client`; the generated configuration selects that directory automatically.

The existing Worker name, compatibility date, preview setting, and Git-triggered publishing workflow are preserved. Image optimization is explicitly limited to build time. Sessions are disabled because the website does not use them, preventing the upgraded adapter from provisioning an unnecessary KV namespace. `compressHTML: true` preserves the previous inline-text spacing behavior.

Do not publish automatically after checks pass. A non-production preview still requires an explicit batch submission request; merging the reviewed PR to main requires a separate explicit owner instruction. The live website receives this fix only after that authorized merge and a successful production build.
