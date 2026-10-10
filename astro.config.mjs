// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";
import { buildConfig } from './scripts/production/build-target.mjs';
import versionIntegration from "./scripts/version-integration.mjs";

// https://astro.build/config
export default defineConfig({
	site: "https://rockybottomhome.com",
	// Preserve the existing spacing between inline elements after the Astro 7 upgrade.
	compressHTML: true,
	// Authentication uses D1 sessions; Astro's separate KV session store is unnecessary.
	session: false,
	integrations: [versionIntegration(), mdx(), sitemap()],
	adapter: cloudflare({
		imageService: "compile",
		configPath: buildConfig(process.env),
	}),
});
