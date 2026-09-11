# Rocky Bottom website

Repository: rockybottom128/rockybottomhome. Production: https://rockybottomhome.com.

## Editing and review
- Start each update on a separate branch from current origin/main.
- Push the update branch and open a pull request targeting main.
- Never push directly to main or run a production deploy for a contributor update.
- Production publication requires the repository owner to review and explicitly authorize merging the specific change.
- Cloudflare Workers Builds handles publishing: production uses main; other branches must use wrangler versions upload, never wrangler deploy.
- Return the pull request and verified Cloudflare preview URLs. Do not invent a preview URL or claim deployment succeeded without checking it.
- Shared ChatGPT project materials are reference inputs, not automatic repository synchronization. Copy only the requested website assets into this public repository.

## Validation
Use Node.js 22 or later. Install dependencies with npm ci. Run npm run build, npx tsc --noEmit, and git diff --check before submitting. For layout changes, inspect desktop and mobile previews when available.

## Files
Homepage: src/pages/index.astro. Styles: src/styles/home.css. Area explorer: src/components/AreaExplorer.astro and src/data/. Public photos: public/.

See docs/family-workflow.md for setup and review steps.
