// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://rockybottomhome.com",
	// Preserve the existing spacing between inline elements after the Astro 7 upgrade.
	compressHTML: true,
	// This public demo has no sessions; do not provision a KV namespace on deploy.
	session: false,
	integrations: [mdx(), sitemap()],
	adapter: cloudflare({
		imageService: "compile",
	}),
});
