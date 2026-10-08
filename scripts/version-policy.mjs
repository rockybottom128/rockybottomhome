export const levels = ['none', 'minor', 'update', 'feature', 'launch'];

export function parseVersion(version, stage) {
  if (!['prelaunch', 'live'].includes(stage)) throw new Error('Unknown release stage');
  const pattern = stage === 'prelaunch' ? /^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/ : /^[1-9]\d*\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  if (typeof version !== 'string' || !pattern.test(version)) throw new Error('Invalid site version');
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Version numbers are too large');
  return parts;
}

export function nextRelease(base, level, authorization = '') {
  const parts = parseVersion(base.version, base.stage);
  if (!levels.includes(level)) throw new Error('Choose none, minor, update, feature, or launch');
  if (level === 'launch') {
    if (base.stage !== 'prelaunch' || authorization.trim().length < 12) throw new Error('Launch requires the explicit owner instruction, recorded verbatim');
    return { version: '1.0.0', stage: 'live' };
  }
  if (level !== 'none') {
    const position = { feature: 0, update: 1, minor: 2 }[level] + (base.stage === 'prelaunch' ? 1 : 0);
    parts[position]++;
    parts.fill(0, position + 1);
  }
  const version = parts.join('.');
  parseVersion(version, base.stage);
  return { version, stage: base.stage };
}

export function docsOnly(files) {
  return files.every(file => file === 'site-version.json' || file === 'AGENTS.md' || file.startsWith('docs/') && file.endsWith('.md'));
}

export function validateRelease(record, base, files, expectedBase) {
  if (record.schema !== 1 || !record.change || !record.base) throw new Error('Missing version classification; run npm run version:prepare');
  if (!/^[a-f0-9]{40}$/.test(record.base.commit)) throw new Error('Invalid release base commit');
  if (expectedBase && record.base.commit !== expectedBase) throw new Error('Release is based on outdated main; fetch, update the branch, and prepare again');
  if (record.base.version !== base.version || record.base.stage !== base.stage) throw new Error('Recorded base version does not match Git history');
  if (typeof record.change.reason !== 'string' || record.change.reason.trim().length < 12) throw new Error('Record a meaningful classification reason');
  const next = nextRelease(base, record.change.level, record.change.launchAuthorization || '');
  if (record.version !== next.version || record.stage !== next.stage) throw new Error(`Expected version ${next.version} (${next.stage})`);
  if (record.change.level === 'none' && !docsOnly(files)) throw new Error('A website or tooling change requires a version increase');
  if (record.change.level !== 'launch' && record.change.launchAuthorization) throw new Error('Launch authorization belongs only on the launch batch');
  return record;
}

export function buildIdentity(release, { branch, commit, dirty = false, cloudflare = false }) {
  parseVersion(release.version, release.stage);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A valid build commit is required');
  if (cloudflare && (!branch || dirty)) throw new Error('Cloudflare builds require a clean, identified branch');
  const environment = cloudflare ? (branch === 'main' ? 'production' : 'preview') : 'local';
  const versionOnly = release.stage === 'live' && environment === 'production';
  const label = versionOnly ? release.version : `${release.stage === 'prelaunch' ? 'Prelaunch ' : ''}${release.version} · ${environment} · ${commit.slice(0, 7)}${dirty ? ' · uncommitted' : ''}`;
  return { version: release.version, stage: release.stage, environment, branch: branch || 'detached', commit, dirty, versionOnly, label };
}

export function publicIdentity(identity) {
  if (identity.versionOnly) return { version: identity.version };
  const { label, versionOnly, ...details } = identity;
  return details;
}
