#!/usr/bin/env python3
"""Save a Resend sending key locally, without printing it or enabling delivery."""
import getpass
import os
from pathlib import Path
import re
import tempfile


def main():
    root = Path(__file__).resolve().parents[2]
    target = root / '.dev.vars'
    if target.is_symlink():
        raise ValueError('Refusing a symlink for the local secrets file.')
    previous = target.read_text() if target.exists() else ''
    if re.search(r'^RESEND_API_KEY=', previous, re.M):
        raise ValueError('A Resend key is already configured; use a deliberate rotation procedure.')
    if not os.isatty(0):
        raise ValueError('Run this utility in your own interactive terminal for hidden entry.')
    key = getpass.getpass('Paste the Resend SEND-ONLY API key (hidden): ').strip()
    if not re.fullmatch(r're_[A-Za-z0-9_-]{10,}', key):
        raise ValueError('Unexpected API key format. Nothing saved.')
    fd, temporary = tempfile.mkstemp(prefix='.resend-setup-', dir=root)
    try:
        with os.fdopen(fd, 'w') as output:
            output.write(previous.rstrip() + '\nRESEND_API_KEY=' + key + '\n')
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Key saved in the ignored, owner-readable .dev.vars file. Delivery mode is unchanged; no email sent.')


if __name__ == '__main__':
    try:
        main()
    except ValueError as error:
        print(error)
        raise SystemExit(1)
    except Exception:
        print('Could not save the key. No credential details were printed.')
        raise SystemExit(1)
