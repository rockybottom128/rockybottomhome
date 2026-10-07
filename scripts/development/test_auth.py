import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('auth', Path(__file__).with_name('rockybottom_auth.py'))
auth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth)

class AuthTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.profile = Path(self.temp.name)
        auth.atomic_json(self.profile / 'app.json', {'app_id': 42, 'slug': 'test-app', 'repository': auth.REPOSITORY})

    def tearDown(self):
        self.temp.cleanup()

    def test_credentials_only_for_exact_repository(self):
        good = {'protocol': 'https', 'host': 'github.com', 'path': auth.REPOSITORY + '.git'}
        self.assertTrue(auth.credential_matches(good))
        for changed in ({'host':'github.com.evil.example'}, {'protocol':'http'}, {'path':'someone/other.git'}, {'path':''}):
            self.assertFalse(auth.credential_matches({**good, **changed}))

    def test_live_cached_token_avoids_network(self):
        auth.atomic_json(self.profile / 'token.json', {'app_id':42, 'token':'fake-cached', 'expires_at':time.time()+900})
        with patch.object(auth, 'api') as api:
            self.assertEqual(auth.access_token(self.profile), 'fake-cached')
            api.assert_not_called()

    def test_near_expiry_renews_and_scopes_token(self):
        auth.atomic_json(self.profile / 'token.json', {'app_id':42, 'token':'fake-old', 'expires_at':time.time()+60})
        install = {'id':9, 'account':{'login':'rockybottom128'}, 'permissions':auth.PERMISSIONS}
        token = {'token':'fake-new', 'expires_at':'2099-01-01T00:00:00Z', 'permissions':auth.PERMISSIONS}
        with patch.object(auth, 'jwt', return_value='fake-jwt'), patch.object(auth, 'api', side_effect=[install,token]) as api:
            self.assertEqual(auth.access_token(self.profile), 'fake-new')
            self.assertEqual(api.call_args.args[2], {'repositories':['rockybottomhome'], 'permissions':auth.PERMISSIONS})
        self.assertEqual((self.profile/'token.json').stat().st_mode & 0o777, 0o600)

    def test_expanded_permissions_rejected(self):
        install = {'id':9, 'account':{'login':'rockybottom128'}, 'permissions':{**auth.PERMISSIONS,'administration':'write'}}
        with patch.object(auth, 'jwt', return_value='fake-jwt'), patch.object(auth, 'api', return_value=install):
            with self.assertRaises(auth.AuthError):
                auth.access_token(self.profile)
        self.assertFalse((self.profile/'token.json').exists())

    def test_shared_private_file_rejected(self):
        (self.profile/'app.json').chmod(0o644)
        with self.assertRaises(auth.AuthError):
            auth.load_config(self.profile)

    def test_other_repository_never_gets_a_token(self):
        with patch('sys.argv', ['auth','--profile',str(self.profile),'git-credential','get']), \
             patch('sys.stdin',io.StringIO('protocol=https\nhost=github.com\npath=other/repo.git\n\n')), \
             patch.object(auth,'access_token') as get, contextlib.redirect_stdout(io.StringIO()) as output:
            auth.main()
            get.assert_not_called()
            self.assertEqual(output.getvalue(),'')

if __name__ == '__main__':
    unittest.main()
