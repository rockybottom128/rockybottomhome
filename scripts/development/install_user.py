#!/usr/bin/env python3
"""Install development tools in one Linux user's home. No GitHub mutations."""
import argparse
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--user', required=True, choices=('scott','karen'))
parser.add_argument('--credentials', required=True, type=Path)
args = parser.parse_args()
account = pwd.getpwnam(args.user)
if os.geteuid() not in (0, account.pw_uid):
    sys.exit('Run under the target user, or use sudo for installation into the other user account.')
home = Path(account.pw_dir)
if args.user == 'karen':
    filesystem = subprocess.run(['findmnt', '-n', '-o', 'FSTYPE', '-T', str(home)], capture_output=True, text=True, check=True).stdout.strip()
    if filesystem != 'ecryptfs':
        sys.exit('Karen must first sign into Linux to unlock her encrypted home. No installation changes were made.')
os.umask(0o077)
source = args.credentials.resolve()
cfg = json.loads((source/'app.json').read_text())
if cfg.get('person') != args.user or cfg.get('repository') != 'rockybottom128/rockybottomhome':
    sys.exit('Credential profile does not match the target user and repository.')
helper_source = Path(__file__).with_name('rockybottom_auth.py')
bin_dir = home/'.local/bin'
lib_dir = home/'.local/lib/rockybottom'
active = home/'.config/rockybottom-development/active'

def own(path):
    if os.geteuid() == 0:
        os.chown(path, account.pw_uid, account.pw_gid, follow_symlinks=False)

def directory(path, mode=0o700):
    missing = []
    current = path
    while not current.exists():
        missing.append(current)
        current = current.parent
    for item in reversed(missing):
        item.mkdir(mode=mode)
        own(item)
    if path.is_symlink():
        sys.exit('Refusing a symbolic-link destination directory.')

def write_file(path, data, mode=0o600):
    if path.is_symlink():
        sys.exit('Refusing to overwrite a symbolic link.')
    if path.exists() and path.read_bytes() != data:
        sys.exit(f'Existing file differs: {path}. Inspect it before replacing.')
    path.write_bytes(data)
    path.chmod(mode)
    own(path)

for d in (bin_dir, lib_dir, active):
    directory(d)
for name in ('app.json','private-key.pem'):
    write_file(active/name, (source/name).read_bytes())
write_file(lib_dir/'rockybottom_auth.py', helper_source.read_bytes(),0o700)
write_file(bin_dir/'rockybottom-auth', b'#!/bin/sh\nexec /usr/bin/python3 "$HOME/.local/lib/rockybottom/rockybottom_auth.py" "$@"\n',0o700)
write_file(bin_dir/'gh', b'#!/bin/sh\nexec /usr/bin/python3 "$HOME/.local/lib/rockybottom/rockybottom_auth.py" gh "$@"\n',0o700)

# Copy the already-verified Node distribution for Karen instead of depending on Scott's private home.
node_source = Path('/home/scott/.local/opt/node-v24.21.0-linux-x64')
node_dest = home/'.local/opt/node-v24.21.0-linux-x64'
if args.user == 'karen':
    directory(node_dest.parent)
    if not node_dest.exists():
        shutil.copytree(node_source,node_dest,symlinks=True)
        own(node_dest)
        for root, dirs, files in os.walk(node_dest):
            for name in dirs+files:
                own(Path(root)/name)
    for name in ('node','npm','npx'):
        link=bin_dir/name
        target=node_dest/'bin'/name
        if not link.exists() and not link.is_symlink():
            link.symlink_to(target)
            own(link)
        elif link.resolve()!=target.resolve():
            sys.exit(f'Existing {name} points elsewhere; inspect before changing it.')

startup=home/'.bashrc'
line='export PATH="$HOME/.local/bin:$PATH"'
existing=startup.read_text() if startup.exists() else ''
if line not in existing:
    with startup.open('a') as out:
        out.write('\n# Rocky Bottom development tools\n'+line+'\n')
    own(startup)
print(f'{args.user}: development helper, App profile, and Node/npm installed. Credentials were not printed.')
print('Restart the app or open a new terminal to refresh its command path.')
