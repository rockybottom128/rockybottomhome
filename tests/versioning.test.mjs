import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { nextRelease, validateRelease, buildIdentity, publicIdentity } from '../scripts/version-policy.mjs';

const base = { version: '0.2.4.9', stage: 'prelaunch' };
const sha = 'a'.repeat(40);
function record(level = 'update') {
  return { schema: 1, ...nextRelease(base, level), base: { ...base, commit: sha }, change: { level, reason: 'Repair the existing gallery navigation behavior' } };
}
test('feature, update, and minor bumps reset only lower counters', () => {
  assert.equal(nextRelease(base, 'feature').version, '0.3.0.0');
  assert.equal(nextRelease(base, 'update').version, '0.2.5.0');
  assert.equal(nextRelease(base, 'minor').version, '0.2.4.10');
  assert.equal(nextRelease(base, 'none').version, base.version);
});
test('launch is explicit and subsequent live versions have three numbers', () => {
  assert.throws(() => nextRelease(base, 'launch'), /explicit owner/);
  const live = nextRelease(base, 'launch', 'Owner explicitly requested the official launch');
  assert.deepEqual(live, { version: '1.0.0', stage: 'live' });
  assert.equal(nextRelease(live, 'feature').version, '2.0.0');
  assert.equal(nextRelease(live, 'update').version, '1.1.0');
  assert.equal(nextRelease(live, 'minor').version, '1.0.1');
  assert.throws(() => nextRelease(live, 'launch', 'Launch approved again'), /Launch requires/);
});
test('missing decisions, hand-edited increments and stale baselines fail', () => {
  assert.throws(() => validateRelease({}, base, [], sha), /Missing/);
  assert.throws(() => validateRelease({ ...record(), version: '0.2.6.0' }, base, [], sha), /Expected/);
  assert.throws(() => validateRelease(record(), base, [], 'b'.repeat(40)), /outdated/);
  assert.throws(() => validateRelease(record(), { ...base, version: '0.2.4.10' }, [], sha), /Git history/);
});
test('no-bump decisions allow only policy and documentation files', () => {
  validateRelease(record('none'), base, ['docs/guide.md', 'AGENTS.md', 'site-version.json'], sha);
  for (const path of ['src/pages/index.astro', 'public/photo.jpg', 'package-lock.json', 'scripts/build.mjs', '.github/workflows/build.yml']) {
    assert.throws(() => validateRelease(record('none'), base, [path], sha), /version increase/);
  }
});
test('malformed numbers and implicit stage changes fail closed', () => {
  for (const version of ['0.02.4.9', '0.2.4', '1.2.4.9', '0.2.-1.0']) assert.throws(() => nextRelease({ ...base, version }, 'minor'));
  assert.throws(() => validateRelease({ ...record(), stage: 'live' }, base, [], sha), /Expected/);
});
test('prelaunch environments identify the commit; local main stays local', () => {
  const local = buildIdentity(base, { branch: 'main', commit: sha, dirty: true });
  assert.equal(local.environment, 'local');
  assert.match(local.label, /local.*aaaaaaa.*uncommitted/);
  for (const [branch, environment] of [['main', 'production'], ['karen/photo-updates', 'preview']]) {
    const info = buildIdentity(base, { branch, commit: sha, cloudflare: true });
    assert.equal(info.environment, environment);
    assert.equal(info.versionOnly, false);
    assert.equal(publicIdentity(info).commit, sha);
  }
});
test('official production shows and exports only the version value', () => {
  const live = { version: '1.2.3', stage: 'live' };
  const production = buildIdentity(live, { branch: 'main', commit: sha, cloudflare: true });
  assert.equal(production.label, '1.2.3');
  assert.equal(production.versionOnly, true);
  assert.deepEqual(publicIdentity(production), { version: '1.2.3' });
  assert.equal(buildIdentity(live, { branch: 'main', commit: sha }).versionOnly, false);
  assert.equal(buildIdentity(live, { branch: 'preview', commit: sha, cloudflare: true }).versionOnly, false);
});
test('retry commits keep the version but change the build identity', () => {
  const first = buildIdentity(base, { branch: 'repair', commit: sha, cloudflare: true });
  const retry = buildIdentity(base, { branch: 'repair', commit: 'b'.repeat(40), cloudflare: true });
  assert.equal(first.version, retry.version);
  assert.notEqual(first.label, retry.label);
  assert.throws(() => buildIdentity(base, { branch: '', commit: sha, cloudflare: true }));
  assert.throws(() => buildIdentity(base, { branch: 'main', commit: sha, dirty: true, cloudflare: true }));
});

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'rockybottom-version-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Version test'); git('config', 'user.email', 'test@example.invalid');
  mkdirSync(join(directory, 'scripts'));
  for (const name of ['versioning.mjs', 'version-policy.mjs']) cpSync(new URL(`../scripts/${name}`, import.meta.url), join(directory, 'scripts', name));
  writeFileSync(join(directory, 'site-version.json'), JSON.stringify(record('minor')));
  git('add', '.'); git('commit', '-m', 'Existing version');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD'); git('switch', '-c', 'contributor/batch');
  const cli = (...args) => execFileSync(process.execPath, ['scripts/versioning.mjs', ...args], { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WORKERS_CI: '', WORKERS_CI_COMMIT_SHA: '', WORKERS_CI_BRANCH: '' } });
  const read = () => JSON.parse(readFileSync(join(directory, 'site-version.json')));
  return { directory, git, cli, read };
}
test('CLI preparation is idempotent across edits and empty retry commits', t => {
  const f = fixture(t);
  const args = ['prepare', '--level', 'update', '--reason', 'Improve the existing page layout'];
  f.cli(...args); const first = f.read();
  f.cli(...args); assert.deepEqual(f.read(), first);
  f.git('add', '.'); f.git('commit', '-m', 'Classified batch');
  f.git('commit', '--allow-empty', '-m', 'Retry build'); f.cli('check');
  f.cli(...args); assert.equal(f.read().version, first.version);
  assert.throws(() => f.cli('prepare', '--level', 'minor', '--reason', 'Try to lower the batch classification'));
});
test('CLI rejects a parallel release until the agent prepares against new main', t => {
  const f = fixture(t);
  f.cli('prepare', '--level', 'update', '--reason', 'Improve the existing gallery behavior');
  f.git('add', '.'); f.git('commit', '-m', 'A release advances main');
  f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  assert.throws(() => f.cli('check'), /Command failed/);
  f.cli('prepare', '--level', 'minor', '--reason', 'Update the descriptive photo caption');
  f.cli('check');
});

test('source tags identify exact main snapshots and retries cannot move them', t => {
  const f = fixture(t);
  const remote = mkdtempSync(join(tmpdir(), 'rockybottom-tag-test-'));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
  f.git('remote', 'add', 'origin', remote);
  f.cli('prepare', '--level', 'feature', '--reason', 'Add a new visitor-facing capability');
  f.git('add', '.'); f.git('commit', '-m', 'New source version');
  f.git('branch', '-f', 'main', 'HEAD'); f.git('switch', 'main');
  f.cli('tag');
  const tag = `site-v${f.read().version}`;
  assert.equal(f.git('rev-parse', `${tag}^{commit}`), f.git('rev-parse', 'HEAD'));
  f.cli('tag');
  const tagged = f.git('rev-parse', `${tag}^{commit}`);
  f.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  mkdirSync(join(f.directory, 'docs'));
  writeFileSync(join(f.directory, 'docs', 'guide.md'), 'Documentation update');
  f.cli('prepare', '--level', 'none', '--reason', 'Document the existing contributor workflow');
  f.git('add', '.'); f.git('commit', '-m', 'Documentation only'); f.cli('tag');
  assert.equal(f.git('rev-parse', `${tag}^{commit}`), tagged);
});
