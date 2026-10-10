// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";
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
		...(process.env.RB_AUTH_DEV === "1" ? { configPath: "wrangler.auth-dev.json" }
			: process.env.RB_LOCAL_AUTH === "1" ? { configPath: "wrangler.auth-local.json" } : {}),
	}),
});
