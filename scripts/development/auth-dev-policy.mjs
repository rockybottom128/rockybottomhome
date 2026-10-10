import assert from 'node:assert/strict';
const expected={name:'rockybottomhome-auth-dev',account:'e6144913ec6fa3b523d5d7e50cce2c40',database:'46691edf-8f7d-48e2-9e72-0586cef46e99',origin:'https://rockybottomhome-auth-dev.accts-e61.workers.dev'};
export function validateAuthDevConfig(c){
 assert.equal(c.name,expected.name,'Only the dedicated development Worker is allowed');
 assert.equal(c.account_id,expected.account);
 assert.ok(!c.routes?.length && !c.route,'Development must not have production routes');
 assert.equal(c.workers_dev,true);
 assert.equal(c.vars.APP_ORIGIN,expected.origin);
 assert.equal(c.vars.AUTH_ENABLED,'true');
 assert.equal(c.vars.MAIL_MODE,'resend');
 assert.equal(c.d1_databases.length,1);
 assert.equal(c.d1_databases[0].binding,'DB');
 assert.equal(c.d1_databases[0].database_id,expected.database);
 for(const key of ['RESEND_API_KEY','AUTH_SECRET','OTP_SECRET','BOOTSTRAP_TOKEN'])assert.ok(!Object.hasOwn(c.vars,key),'Credentials must remain in Worker secrets');
}

export function validateAuthDevBranch(branch){assert.equal(branch,'rockyadmin/database-owner-auth','This development target accepts only the authentication feature branch');}
