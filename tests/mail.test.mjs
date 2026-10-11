// Compile only local mail dependencies; exercise the provider contract without network or secrets.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {fixture} from './helpers/d1.mjs';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'rb-mail-test-'));
for(const name of ['mail','env','rate-limit','crypto','visitor-allowlist']) {
  const source=readFileSync(`src/server/${name}.ts`,'utf8').replace(/from '(\.\/[^']+)'/g,(_,path)=>"from '"+path.replace(/\.ts$/, '')+".mjs'");
  writeFileSync(join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {sendMail,visitorRecipientAllowed}=await import(pathToFileURL(join(dir,'mail.mjs')).href);
const {limit,RateLimitError}=await import(pathToFileURL(join(dir,'rate-limit.mjs')).href);
rmSync(dir,{recursive:true,force:true});
function mailFixture(){
 const {db,env}=fixture();Object.assign(env,{MAIL_MODE:'resend',APP_ORIGIN:'https://auth.example.com',OTP_SECRET:'fictional-test-secret',RESEND_API_KEY:'re_test_fixture_not_real',MAIL_FROM:'bookings@notify.rockybottomhome.com',MAIL_REPLY_TO:'bookings@rockybottomhome.com',MAIL_ALLOWED_RECIPIENTS:'visitor@example.com'});return {db,env};
}
test('Resend contract, privacy, failure handling and sending restrictions',async()=>{
 const {db,env}=mailFixture();const original=globalThis.fetch;let calls=[];
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
 }finally{globalThis.fetch=original;db.close();}
});

test('rate limit reports remaining wait without resetting the window',async()=>{
 const env={OTP_SECRET:'fictional-test-secret'};const expires=Date.now()+120000;
 const limited={...env,DB:{prepare(){return {bind(){return {async first(){return {count:11,expires_at:expires}}}}}}}};
 await assert.rejects(limit(limited,'test',10,3600000),error=>error instanceof RateLimitError && error.retryAfter>0 && error.retryAfter<=120 && /No email was sent/.test(error.message));
});



test('D1 visitor policy uses exact domains and private addresses',async()=>{
 for(const file of ['wrangler.auth-local.json','wrangler.auth-dev.json','wrangler.production.json']){
  const {db,env}=mailFixture();try{
   Object.assign(env,JSON.parse(readFileSync(file,'utf8')).vars,{VISITOR_EMAIL_ADDRESSES:'guest.one@gmail.com, GUEST.TWO@YAHOO.COM'});
   for(const domain of ['farts.cloud','scottdempsey.com','table42.cafe','transfix.io','trshvac.com','trs-hvac.com']){
    assert.equal(await visitorRecipientAllowed(env,'Test@'+domain.toUpperCase()),true);
    assert.equal(await visitorRecipientAllowed(env,'test@sub.'+domain),false);
    assert.equal(await visitorRecipientAllowed(env,'test@'+domain+'.evil.test'),false);
   }
   for(const email of ['guest.one@gmail.com','GUEST.TWO@YAHOO.COM','visitor@example.com'])assert.equal(await visitorRecipientAllowed(env,email),true,email);
   for(const email of ['another@gmail.com','another@yahoo.com','guest.one+extra@gmail.com','guestone@gmail.com'])assert.equal(await visitorRecipientAllowed(env,email),false,email);
   db.exec('DELETE FROM visitor_allowlist_entries');
   assert.equal(await visitorRecipientAllowed(env,'guest.one@gmail.com'),false,'Removed entries never return from old environment values');
  }finally{db.close();}
 }
});
test('owner delivery is independent of visitor policy; missing DB policy fails closed',async()=>{
 const {db,env}=mailFixture(),original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({id:'fixture-receipt'})};
  db.exec("INSERT INTO owner_accounts VALUES ('owner','owner@elsewhere.test',NULL,'invited',0)");
  await assert.rejects(sendMail(env,'owner@elsewhere.test','test','body'));
  await sendMail(env,'owner@elsewhere.test','test','body','owner');assert.equal(calls.length,1);
  db.exec("UPDATE owner_accounts SET status='removed'");await assert.rejects(sendMail(env,'owner@elsewhere.test','test','body','owner'));assert.equal(calls.length,1);
  db.exec('DROP TABLE visitor_allowlist_entries');await assert.rejects(sendMail(env,'visitor@example.com','test','body'));assert.equal(calls.length,1);
 }finally{globalThis.fetch=original;db.close();}
});
