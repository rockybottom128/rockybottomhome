// Compile only local mail dependencies; exercise the provider contract without network or secrets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'rb-mail-test-'));
for(const name of ['mail','env','rate-limit','crypto']) {
  const source=readFileSync(`src/server/${name}.ts`,'utf8').replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {sendMail,visitorRecipientAllowed}=await import(pathToFileURL(join(dir,'mail.mjs')).href);
const {limit,RateLimitError}=await import(pathToFileURL(join(dir,'rate-limit.mjs')).href);
rmSync(dir,{recursive:true,force:true});
const env={MAIL_MODE:'resend',APP_ORIGIN:'https://auth.example.com',OTP_SECRET:'fictional-test-secret',RESEND_API_KEY:'re_test_fixture_not_real',MAIL_FROM:'bookings@notify.rockybottomhome.com',MAIL_REPLY_TO:'bookings@rockybottomhome.com',MAIL_ALLOWED_RECIPIENTS:'visitor@example.com',DB:{prepare(){return {bind(){return {async first(){return {count:1}},async run(){throw new Error('Real mail must not be stored in the fictional inbox')}}}}}}};
test('Resend contract, privacy, failure handling and sending restrictions',async()=>{
 const original=globalThis.fetch;let calls=[];
 try {
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({id:'message-receipt'})};
  assert.equal(await sendMail(env,'visitor@example.com','Verify your email','Your code is 12345678.','visitor','booking-fixture-key'),'message-receipt');
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.resend.com/emails');
  const {options}=calls[0],payload=JSON.parse(options.body);
  assert.equal(options.headers.Authorization,'Bearer '+env.RESEND_API_KEY);
  assert.equal(options.redirect,'manual');assert.ok(options.signal);assert.equal(options.headers['Idempotency-Key'],'booking-fixture-key');
  assert.deepEqual(payload,{from:'Rocky Bottom <bookings@notify.rockybottomhome.com>',reply_to:'bookings@rockybottomhome.com',to:['visitor@example.com'],subject:'Verify your email',text:'Your code is 12345678.'});
  for(const [changed,to,subject] of [[{},'stranger@example.com','test'],[{},'visitor@example.com','bad\r\nBcc: someone'],[{MAIL_REPLY_TO:'personal@example.com'},'visitor@example.com','test'],[{RESEND_API_KEY:''},'visitor@example.com','test'],[{MAIL_MODE:'test'},'visitor@example.com','test']]) {
   await assert.rejects(sendMail({...env,...changed},to,subject,'body'));
  }
  assert.equal(calls.length,1,'Rejected input must never reach the provider');
  for(const status of [401,403,429,500]) {
   let count=0;globalThis.fetch=async()=>{count++;return new Response('sensitive provider payload',{status})};
   await assert.rejects(sendMail(env,'visitor@example.com','test','body'),{message:'Email delivery unavailable'});assert.equal(count,1);
  }
  globalThis.fetch=async()=>Response.json({});
  await assert.rejects(sendMail(env,'visitor@example.com','test','body'),{message:'Email delivery unavailable'});
  let count=0;globalThis.fetch=async()=>{count++;throw new Error('timeout with secret request details')};
  await assert.rejects(sendMail(env,'visitor@example.com','test','body'),{message:'Email delivery unavailable'});assert.equal(count,1,'Ambiguous sends are not retried');
 }finally{globalThis.fetch=original;}
});

test('rate limit reports remaining wait without resetting the window',async()=>{
 const expires=Date.now()+120000;
 const limited={...env,DB:{prepare(){return {bind(){return {async first(){return {count:11,expires_at:expires}}}}}}}};
 await assert.rejects(limit(limited,'test',10,3600000),error=>error instanceof RateLimitError && error.retryAfter>0 && error.retryAfter<=120 && /No email was sent/.test(error.message));
});


test('visitor domains use exact normalized matches, never substrings or subdomains',()=>{
 const policy={...env,VISITOR_EMAIL_DOMAINS:'farts.cloud,scottdempsey.com,table42.cafe'};
 for(const email of ['alice@farts.cloud','KAREN@SCOTTDEMPSEY.COM','booking+test@table42.cafe','visitor@example.com'])assert.equal(visitorRecipientAllowed(policy,email),true,email);
 for(const email of ['x@evilfarts.cloud','x@farts.cloud.evil.test','x@sub.scottdempsey.com','farts.cloud@evil.test','x@elsewhere.test'])assert.equal(visitorRecipientAllowed(policy,email),false,email);
 assert.equal(visitorRecipientAllowed({...policy,MAIL_ALLOWED_RECIPIENTS:'',VISITOR_EMAIL_DOMAINS:''},'x@farts.cloud'),false);
});

test('owner delivery requires a registered active/invited owner, independent of visitor domains',async()=>{
 const original=globalThis.fetch;const calls=[];let registered=true;
 const policy={...env,VISITOR_EMAIL_DOMAINS:'farts.cloud,scottdempsey.com,table42.cafe',DB:{prepare(sql){return {bind(email){return {async first(){
   if(sql.includes('FROM owner_accounts')){assert.match(sql,/status IN \('active','invited'\)/);assert.equal(email,'karen@elsewhere.test');return registered?{id:'owner-fixture'}:null;}
   return {count:1};
 }}}}}}};
 try {
  globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'fixture-receipt'})};
  await assert.rejects(sendMail(policy,'karen@elsewhere.test','Verification','body'));
  assert.equal(calls.length,0,'Outside visitor domain cannot receive public codes');
  await sendMail(policy,'Karen@Elsewhere.test','Owner invitation','body','owner');
  assert.equal(calls.length,1);assert.deepEqual(calls[0].to,['karen@elsewhere.test']);
  registered=false;
  await assert.rejects(sendMail(policy,'karen@elsewhere.test','Owner invitation','body','owner'));
  assert.equal(calls.length,1,'Removed or unregistered owners receive no owner email');
  await sendMail(policy,'someone@table42.cafe','Verification','body');
  assert.equal(calls.length,2,'An approved visitor domain reaches the provider');
 }finally{globalThis.fetch=original;}
});
