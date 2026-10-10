import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAuthDevConfig,validateAuthDevBranch} from '../scripts/development/auth-dev-policy.mjs';
const config=JSON.parse(readFileSync('wrangler.auth-dev.json','utf8'));
validateAuthDevConfig(config);
for(const branch of ['dev','rockyadmin/database-owner-auth','rockyadmin/email-testing-policy','karen/photos','scott/calendar'])validateAuthDevBranch(branch);
for(const branch of ['main','other/photos','karen/../main','scott/a.lock','karen//photos','karen/photos/','',undefined])assert.throws(()=>validateAuthDevBranch(branch));
for(const mutate of [
 c=>c.name='rockybottomhome',
 c=>c.routes=['rockybottomhome.com/*'],
 c=>c.route='rockybottomhome.com/*',
 c=>c.vars.APP_ORIGIN='https://rockybottomhome.com',
 c=>c.d1_databases[0].database_id='production-db',
 c=>c.vars.RESEND_API_KEY='fake-test-value',
 c=>c.account_id='different-account',
]){const changed=structuredClone(config);mutate(changed);assert.throws(()=>validateAuthDevConfig(changed));}
console.log('PASS: development deployment rejects production targets, unapproved branches and inline credentials.');
