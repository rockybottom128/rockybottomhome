#!/usr/bin/env python3
"""One-time local GitHub App manifest registration. Never logs credentials."""
import html
import json
import os
from pathlib import Path
import secrets
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse, urlencode
from urllib.request import Request, urlopen

ROOT = Path.home() / '.config' / 'rockybottom-development'
PORT = 4387
STATES = {person: secrets.token_urlsafe(32) for person in ('scott', 'karen')}
ENTRY = secrets.token_urlsafe(24)
BASE = f'http://127.0.0.1:{PORT}'

def save_private(path, text):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as out:
        out.write(text)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def page(self, body, status=200):
        data = ('<!doctype html><html><head><meta charset="utf-8">'
                '<title>Rocky Bottom development access</title>'
                '<style>body{font:18px system-ui;max-width:760px;margin:60px auto;line-height:1.6;padding:20px}'
                'button,a.button{background:#235849;color:white;padding:12px 20px;border:0;border-radius:6px;cursor:pointer}'
                'section{border-top:1px solid #ddd;margin-top:28px;padding-top:16px}</style></head><body>'
                '<h1>Rocky Bottom development access</h1>' + body + '</body></html>').encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if self.headers.get('Host') != f'127.0.0.1:{PORT}':
            return self.page('Unrecognized host.', 400)
        if u.path == '/setup' and secrets.compare_digest(q.get('key', [''])[0], ENTRY):
            body = '<p>Use a browser signed into GitHub as <strong>rockybottom128</strong>.</p>'
            body += '<p>Each private App can edit repository contents and pull requests, and read build checks. '
            body += 'It receives no administration permission or production-rule bypass. '
            body += 'Install each App on <strong>Only select repositories → rockybottomhome</strong>.</p>'
            for person, state in STATES.items():
                cfg = ROOT / person / 'app.json'
                body += f'<section><h2>{person.title()}</h2>'
                if cfg.exists():
                    slug = json.loads(cfg.read_text())['slug']
                    body += f'<p>App registered.</p><a class="button" href="https://github.com/apps/{html.escape(slug)}/installations/new">Install {person.title()} App</a>'
                else:
                    manifest = {
                        'name': f'rockybottom128-{person}-laptop',
                        'url': 'https://github.com/rockybottom128/rockybottomhome',
                        'description': f'Rocky Bottom branch editing and review submissions from {person.title()} on the laptop. Production promotion is reserved for the owner.',
                        'redirect_url': f'{BASE}/callback/{person}',
                        'public': False,
                        'default_permissions': {'contents': 'write', 'pull_requests': 'write', 'checks': 'read', 'statuses': 'read', 'metadata': 'read'},
                        'default_events': [],
                    }
                    body += f'<form action="https://github.com/settings/apps/new?{urlencode({"state": state})}" method="post">'
                    body += f'<input type="hidden" name="manifest" value="{html.escape(json.dumps(manifest), quote=True)}">'
                    body += f'<button type="submit">Register {person.title()} App</button></form>'
                body += '</section>'
            return self.page(body)
        if u.path.startswith('/callback/'):
            person = u.path.removeprefix('/callback/')
            if person not in STATES or not secrets.compare_digest(q.get('state', [''])[0], STATES[person]):
                return self.page('Registration state was not recognized. Return to the original setup page.', 400)
            cfg_path = ROOT / person / 'app.json'
            if cfg_path.exists():
                return self.page('This App is already registered. Return to the setup page to install it.')
            code = q.get('code', [''])[0]
            if not code.isalnum():
                return self.page('Missing or invalid registration code.', 400)
            try:
                req = Request(f'https://api.github.com/app-manifests/{code}/conversions', data=b'{}',
                              headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'RockyBottom-setup', 'Content-Type': 'application/json'})
                with urlopen(req, timeout=30) as response:
                    app = json.load(response)
                if app.get('owner', {}).get('login', '').lower() != 'rockybottom128':
                    return self.page('The App was registered under a different account. Stop here and tell the setup assistant.', 400)
                save_private(ROOT / person / 'private-key.pem', app['pem'])
                save_private(cfg_path, json.dumps({'app_id': app['id'], 'slug': app['slug'], 'repository': 'rockybottom128/rockybottomhome', 'person': person}, indent=2) + '\n')
                print(f'{person}: App registration saved securely; installation still required.', flush=True)
                return self.page(f'<p>{person.title()} App registered. The private key has been stored securely; it is not shown here.</p>'
                                 f'<p>Next, install it on <strong>Only select repositories → rockybottomhome</strong>.</p>'
                                 f'<a class="button" href="https://github.com/apps/{html.escape(app["slug"])}/installations/new">Install {person.title()} App</a>'
                                 f'<p><a href="/setup?key={ENTRY}">Return to setup for the other user</a></p>')
            except Exception as exc:
                print(f'{person}: registration could not finish ({type(exc).__name__}); no credentials printed.', flush=True)
                return self.page('Registration could not finish. Tell the setup assistant; do not retry registration yet.', 500)
        self.page('Use the setup link provided in the chat.', 404)

if __name__ == '__main__':
    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    server = HTTPServer(('127.0.0.1', PORT), Handler)
    print(f'Setup page: {BASE}/setup?key={ENTRY}', flush=True)
    server.serve_forever()
