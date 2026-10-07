#!/usr/bin/env python3
"""Repository-scoped GitHub App authentication for Git and GitHub CLI."""
import base64
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import shlex
import stat
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPOSITORY = 'rockybottom128/rockybottomhome'
PERMISSIONS = {'contents': 'write', 'pull_requests': 'write', 'checks': 'read', 'statuses': 'read', 'metadata': 'read'}

class AuthError(Exception):
    pass

def api(path, token, body=None):
    data = None if body is None else json.dumps(body).encode()
    request = Request('https://api.github.com' + path, data=data, headers={
        'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + token,
        'User-Agent': 'RockyBottom-development', 'Content-Type': 'application/json',
    })
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as exc:
        # Never expose response bodies, request headers or credentials.
        raise AuthError(f'GitHub returned HTTP {exc.code}. Check the App installation and permissions.') from None
    except URLError:
        raise AuthError('Cannot reach GitHub. Check the network connection.') from None

def secure_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise AuthError(f'{path.name} must be a regular file owned by this user with permissions 600.')

def atomic_json(path, value):
    temp = path.with_name(path.name + f'.{os.getpid()}.tmp')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(value, out)
            out.write('\n')
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()

def jwt(profile, app_id):
    key = profile / 'private-key.pem'
    secure_file(key)
    def encoded(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    now = int(time.time())
    message = encoded({'alg': 'RS256', 'typ': 'JWT'}) + b'.' + encoded({'iat': now - 60, 'exp': now + 540, 'iss': str(app_id)})
    result = subprocess.run(['/usr/bin/openssl', 'dgst', '-sha256', '-sign', str(key)], input=message, capture_output=True)
    if result.returncode:
        raise AuthError('Unable to sign the App request with the stored private key.')
    return (message + b'.' + base64.urlsafe_b64encode(result.stdout).rstrip(b'=')).decode()

def load_config(profile):
    secure_file(profile / 'app.json')
    cfg = json.loads((profile / 'app.json').read_text())
    if cfg.get('repository') != REPOSITORY:
        raise AuthError('This credential profile is not scoped to Rocky Bottom Home.')
    return cfg

def access_token(profile, force=False):
    cfg = load_config(profile)
    fd = os.open(profile / 'token.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cache = profile / 'token.json'
        if cache.exists() and not force:
            secure_file(cache)
            saved = json.loads(cache.read_text())
            if saved.get('app_id') == cfg['app_id'] and saved.get('expires_at', 0) > time.time() + 300:
                return saved['token']
        signed = jwt(profile, cfg['app_id'])
        install = api(f'/repos/{REPOSITORY}/installation', signed)
        if install.get('account', {}).get('login', '').lower() != 'rockybottom128':
            raise AuthError('The App installation belongs to an unexpected account.')
        if install.get('suspended_at'):
            raise AuthError('The development App has been suspended by its owner.')
        actual = install.get('permissions', {})
        if actual != PERMISSIONS:
            raise AuthError('The App permissions differ from the approved development permissions. Ask Scott to inspect its settings.')
        result = api(f'/app/installations/{install["id"]}/access_tokens', signed, {
            'repositories': ['rockybottomhome'], 'permissions': PERMISSIONS,
        })
        if result.get('permissions') != PERMISSIONS:
            raise AuthError('GitHub returned unexpected token permissions.')
        expiry = datetime.fromisoformat(result['expires_at'].replace('Z', '+00:00')).timestamp()
        atomic_json(cache, {'app_id': cfg['app_id'], 'token': result['token'], 'expires_at': expiry})
        return result['token']

def credential_matches(fields):
    return (fields.get('protocol') == 'https' and fields.get('host', '').lower() == 'github.com'
            and fields.get('path', '').rstrip('/') in (REPOSITORY, REPOSITORY + '.git'))

def main():
    os.umask(0o077)
    args = sys.argv[1:]
    profile = Path.home() / '.config' / 'rockybottom-development' / 'active'
    if len(args) >= 2 and args[0] == '--profile':
        profile = Path(args[1])
        args = args[2:]
    if not args:
        raise AuthError('Use gh, verify, or git-credential.')
    if args[0] == 'git-credential':
        operation = args[1] if len(args) > 1 else ''
        fields = dict(line.rstrip('\n').split('=', 1) for line in sys.stdin if '=' in line)
        if not credential_matches(fields):
            return
        if operation == 'get':
            # Standard Git helper protocol; output is consumed directly by Git.
            print('username=x-access-token\npassword=' + access_token(profile) + '\n')
        elif operation == 'erase':
            (profile / 'token.json').unlink(missing_ok=True)
        return
    if args[0] == 'verify':
        cfg = load_config(profile)
        token = access_token(profile, force='--refresh' in args)
        repos = api('/installation/repositories', token)
        names = [r['full_name'] for r in repos.get('repositories', [])]
        if names != [REPOSITORY] or repos.get('total_count') != 1:
            raise AuthError('The token is not limited to the expected single repository.')
        print(json.dumps({'app': cfg['slug'], 'repository': names[0], 'permissions': PERMISSIONS,
                          'automatic_renewal': True}, indent=2))
        return
    if args[0] == 'configure-repo' and len(args) == 2:
        repo = Path(args[1]).resolve()
        origin = subprocess.run(['/usr/bin/git', '-C', str(repo), 'remote', 'get-url', 'origin'], capture_output=True, text=True, check=True).stdout.strip()
        if origin not in (f'https://github.com/{REPOSITORY}', f'https://github.com/{REPOSITORY}.git'):
            raise AuthError('The checkout must have the expected Rocky Bottom HTTPS origin.')
        load_config(profile)
        command = '!' + shlex.join(['/usr/bin/python3', str(Path(__file__).resolve()), '--profile', str(profile), 'git-credential'])
        def config(*values):
            subprocess.run(['/usr/bin/git', '-C', str(repo), 'config', '--local', *values], check=True)
        config('--replace-all', 'credential.helper', '')
        config('--add', 'credential.helper', command)
        config('credential.useHttpPath', 'true')
        config('push.default', 'current')
        config('remote.pushDefault', 'origin')
        print(f'App credential helper configured for {repo}. Human commit identity is unchanged.')
        return
    if args[0] == 'gh':
        if args[1:3] == ['auth', 'status']:
            cfg = load_config(profile)
            access_token(profile)
            print(f'github.com: authenticated as App {cfg["slug"]}; repository {REPOSITORY}; automatic token renewal enabled.')
            return
        if args[1:3] in (['auth', 'login'], ['auth', 'switch'], ['auth', 'setup-git']):
            raise AuthError('This development profile uses App authentication. Do not replace it with the owner login; use a separate approval session.')
        env = os.environ.copy()
        for name in ('GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'):
            env.pop(name, None)
        env['GH_TOKEN'] = access_token(profile)
        env['GH_HOST'] = 'github.com'
        env['GH_REPO'] = REPOSITORY
        # The App token is passed in the environment, never command arguments.
        os.execve('/usr/bin/gh', ['/usr/bin/gh'] + args[1:], env)
    raise AuthError('Unknown operation.')

if __name__ == '__main__':
    try:
        main()
    except (AuthError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        message = str(exc) if isinstance(exc, AuthError) else 'Development credentials are incomplete or unreadable. Ask Scott to finish setup.'
        print('Rocky Bottom access: ' + message, file=sys.stderr)
        sys.exit(1)
