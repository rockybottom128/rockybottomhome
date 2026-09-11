# Rocky Bottom Home

A single-page for-sale-by-owner demo in Rocky Bottom, Sunset, SC, built with the existing Astro and Cloudflare Workers starter.

## Preview

Use Node 22 or later. Run `npm ci`, then `npm run dev`. Run `npm run check` before deploying through the existing Cloudflare integration.

## Before making this a live listing

- Replace the clearly labeled Unsplash inspiration photograph with actual property photos. The current image is not this home or its location. Photo source: https://unsplash.com/photos/modern-house-with-wooden-deck-in-snowy-landscape-Wd8Nm8iXglQ (Clay Banks; Unsplash License).
- Add the owner's confirmed asking price, bedroom/bathroom count, square footage, and lot size.
- Replace the pending contact notice with the owner's preferred contact method. No form submissions or tour requests are collected by this demo.
- Remove the design-preview banner and sample-image captions after the actual content is in place.
- Remove the `noindex, nofollow` meta tag when the listing is ready for search indexing.

The homepage is `src/pages/index.astro`, its styling is `src/styles/home.css`, and the site address is set in `astro.config.mjs`. The existing Workers configuration and deployment scripts are preserved. Blog sample pages have been removed.
