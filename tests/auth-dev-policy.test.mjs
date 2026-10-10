import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAuthDevConfig,validateAuthDevBranch} from '../scripts/development/auth-dev-policy.mjs';
const config=JSON.parse(readFileSync('wrangler.auth-dev.json','utf8'));
validateAuthDevConfig(config);
validateAuthDevBranch('rockyadmin/database-owner-auth');
for(const branch of ['main','karen/photos','',undefined])assert.throws(()=>validateAuthDevBranch(branch));
for(const mutate of [
 c=>c.name='rockybottomhome',
 c=>c.routes=['rockybottomhome.com/*'],
 c=>c.route='rockybottomhome.com/*',
 c=>c.vars.APP_ORIGIN='https://rockybottomhome.com',
 c=>c.d1_databases[0].database_id='production-db',
 c=>c.vars.RESEND_API_KEY='fake-test-value',
 c=>c.account_id='different-account',
]){const changed=structuredClone(config);mutate(changed);assert.throws(()=>validateAuthDevConfig(changed));}
console.log('PASS: development deployment rejects production targets, other branches and inline credentials.');
