import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));

function atLeast(actual, minimum) {
  assert.match(actual, /^\d+\.\d+\.\d+$/, `Expected a stable version: ${actual}`);
  const current = actual.split('.').map(Number);
  const required = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (current[i] !== required[i]) return current[i] > required[i];
  }
  return true;
}

test('Astro and every locked Sharp copy include the AVIF security fixes', () => {
  // GHSA-26w7-cxv4-gfx2: Astro 7.2.8 requires the patched Sharp image service.
  assert.ok(atLeast(require('astro/package.json').version, '7.2.8'));
  const copies = Object.entries(lock.packages).filter(([path]) => /(?:^|\/)node_modules\/sharp$/.test(path));
  assert.ok(copies.length > 0, 'The build-time image service must be present');
  for (const [path, entry] of copies) {
    // 0.35.5 also includes the follow-up librsvg fix.
    assert.ok(atLeast(entry.version, '0.35.5'), `${path} has vulnerable Sharp ${entry.version}`);
  }
  assert.ok(atLeast(sharp.versions.sharp, '0.35.5'));
});

test('the installed patched image service can encode and decode a benign AVIF', async () => {
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#2d583e' } }).avif().toBuffer();
  const { info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 8);
  assert.equal(info.height, 8);
  assert.equal(info.channels, 3);
});
