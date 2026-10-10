#!/usr/bin/env python3
"""Operator utility. Token entered privately, never in arguments or logs."""
import getpass
import json
import urllib.request
import urllib.parse
origin = input('Dedicated development app origin (https://…): ').strip().rstrip('/')
u = urllib.parse.urlsplit(origin)
if u.path or u.query or u.fragment or u.username or not (u.scheme=='https' or u.hostname in ('127.0.0.1','localhost')):
    raise SystemExit('Use the configured development origin, not an arbitrary callback URL.')
token = getpass.getpass('One-time BOOTSTRAP_TOKEN (hidden): ')
request = urllib.request.Request(origin+'/api/owner/bootstrap',data=b'{}',headers={
    'Authorization':'Bearer '+token,'Origin':origin,'Content-Type':'application/json'})
try:
    with urllib.request.urlopen(request,timeout=30) as response: json.load(response)
    print('Initial owner invitation saved. Check the configured owner email for the password-setup link. Remove BOOTSTRAP_TOKEN after setup.')
except Exception:
    print('Setup was not completed or already exists. Check configuration and owner invitation state; no credentials were printed.')
    raise SystemExit(1)
