import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { levels, nextRelease, validateRelease, buildIdentity } from './version-policy.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
const file = resolve(root, 'site-version.json');
// The last unversioned production commit. Never infer a missing version as zero.
const bootstrap = '9f7bd67b625f2aa3ba41ad0624ffe850be5bcb62';
export function git(...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function readRecord() { return JSON.parse(readFileSync(file, 'utf8')); }
function baseRelease(sha) {
  try { return JSON.parse(git('show', `${sha}:site-version.json`)); }
  catch (error) {
    if (sha === bootstrap && git('rev-parse', `${sha}^{commit}`) === bootstrap) return { version: '0.0.0.0', stage: 'prelaunch' };
    throw new Error(`Cannot read version at ${sha}; fetch the base history first`, { cause: error });
  }
}
function changedFiles(base) {
  return [...new Set([git('diff', '--name-only', base, '--'), git('ls-files', '--others', '--exclude-standard')].flatMap(value => value.split('\n').filter(Boolean)))];
}
export function check(baseRef) {
  const record = readRecord();
  // Fetch only in Cloudflare's clean checkout, where history can be shallow.
  if (process.env.WORKERS_CI === '1' || process.env.WORKERS_CI_COMMIT_SHA) {
    if (!process.env.WORKERS_CI_COMMIT_SHA || !process.env.WORKERS_CI_BRANCH) throw new Error('Cloudflare build identity is missing; do not guess the deployment environment');
    if (!/^[a-f0-9]{40}$/.test(record.base?.commit)) throw new Error('Invalid base commit');
    if (git('rev-parse', '--is-shallow-repository') === 'true') git('fetch', '--no-tags', '--unshallow', 'origin');
    git('fetch', '--no-tags', '--depth=1', 'origin', record.base.commit);
    if (process.env.WORKERS_CI_BRANCH !== 'main') {
      git('fetch', '--no-tags', '--depth=1', 'origin', 'main:refs/remotes/origin/main');
      baseRef ||= 'origin/main';
    }
  } else if (!baseRef && git('branch', '--show-current') && git('branch', '--show-current') !== 'main') {
    baseRef = 'origin/main';
  }
  const expectedBase = baseRef ? git('rev-parse', `${baseRef}^{commit}`) : undefined;
  try { git('merge-base', '--is-ancestor', record.base.commit, 'HEAD'); }
  catch { throw new Error('The release base is not included in this branch; update from main before preparing'); }
  return validateRelease(record, baseRelease(record.base.commit), changedFiles(record.base.commit), expectedBase);
}
export function identity() {
  const record = readRecord();
  const cloudflare = process.env.WORKERS_CI === '1' || Boolean(process.env.WORKERS_CI_COMMIT_SHA);
  const head = git('rev-parse', 'HEAD');
  if (cloudflare && process.env.WORKERS_CI_COMMIT_SHA !== head) throw new Error('Cloudflare commit does not match checkout');
  return buildIdentity(record, {
    cloudflare,
    commit: cloudflare ? process.env.WORKERS_CI_COMMIT_SHA : head,
    branch: cloudflare ? process.env.WORKERS_CI_BRANCH : git('branch', '--show-current'),
    dirty: Boolean(git('status', '--porcelain', '--untracked-files=normal')),
  });
}
function main() {
  const [command, ...args] = process.argv.slice(2);
  function option(name, fallback = '') { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] || ''; }
  if (command === 'prepare') {
    const base = git('rev-parse', `${option('--base', 'origin/main')}^{commit}`);
    try { git('merge-base', '--is-ancestor', base, 'HEAD'); }
    catch { throw new Error('Update this branch from current main before preparing its version'); }
    const prior = baseRelease(base);
    let level = option('--level');
    const reason = option('--reason');
    const launchAuthorization = option('--launch-authorization');
    if (!levels.includes(level) || reason.trim().length < 12) throw new Error('Supply --level and a meaningful --reason');
    if (existsSync(file)) {
      const previous = readRecord();
      if (previous.base.commit === base && levels.indexOf(previous.change.level) > levels.indexOf(level)) {
        throw new Error('Do not downgrade an existing batch classification; retain the highest applicable level');
      }
    }
    const record = { schema: 1, ...nextRelease(prior, level, launchAuthorization), base: { commit: base, version: prior.version, stage: prior.stage }, change: { level, reason, ...(launchAuthorization ? { launchAuthorization } : {}) } };
    validateRelease(record, prior, changedFiles(base), base);
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    console.log(`Prepared ${record.version}: ${level} — ${reason}`);
  } else if (command === 'check') {
    console.log(`Version policy passed: ${check(option('--base') || undefined).version}`);
  } else if (command === 'tag') {
    const record = check('HEAD^1');
    if (git('branch', '--show-current') !== 'main') throw new Error('Source tags are created only from main');
    const tag = `site-v${record.version}`;
    let existing;
    try { existing = git('rev-parse', '--verify', `refs/tags/${tag}`); } catch {}
    if (existing) {
      git('merge-base', '--is-ancestor', `${tag}^{commit}`, 'HEAD');
      if (git('rev-parse', `${tag}^{commit}`) !== git('rev-parse', 'HEAD') && record.change.level !== 'none') throw new Error('This source version already has a tag; never move it');
      console.log(`Retaining immutable source tag ${tag}`);
    } else {
      if (record.change.level === 'none') throw new Error('The previous release tag is missing; rerun that release workflow rather than tagging a different snapshot');
      git('tag', '-a', tag, '-m', `Site ${record.version}: ${record.change.reason}\nSource snapshot; deployment success is recorded by Cloudflare checks.`);
      git('push', 'origin', `refs/tags/${tag}`);
      console.log(`Created ${tag}`);
    }
  } else throw new Error('Use prepare, check, or tag');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
