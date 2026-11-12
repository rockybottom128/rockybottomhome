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

test('exhausted verification budget cannot starve booking, reset, invitation or report mail',async()=>{
 const {db,env}=mailFixture(),original=globalThis.fetch;let calls=0;
 try{
  env.VISITOR_EMAIL_DOMAINS='example.com';
  globalThis.fetch=async()=>{calls++;return Response.json({id:'receipt'})};
  db.exec("INSERT INTO owner_accounts VALUES ('o','owner@example.com',NULL,'active',0)");
  db.exec("INSERT INTO punch_reports VALUES ('r','o',0,'{}','[]'); INSERT INTO punch_report_deliveries(id,report_id,recipient,include_attribution,status) VALUES ('d','r','owner@example.com',0,'sending')");
  for(let i=0;i<60;i++)await sendMail(env,`guest${i}@example.com`,'Verification','code');
  await assert.rejects(sendMail(env,'extra@example.com','Verification','code'),RateLimitError);
  assert.equal(calls,60);
  for(const purpose of ['booking','owner-reset','owner','report'])await sendMail(env,'owner@example.com','Notice','body',purpose,purpose==='report'?'d':undefined);
  assert.equal(calls,64);
  await assert.rejects(sendMail(env,'blocked@elsewhere.test','Booking','body','booking'),/not enabled/);
  await assert.rejects(sendMail(env,'stranger@example.com','Reset','body','owner-reset'),/not authorized/);
  await assert.rejects(sendMail(env,'owner@example.com','Report','body','report','wrong-delivery'),/not authorized/);
  assert.equal(calls,64,'Isolated budgets never bypass recipient authorization');
 }finally{globalThis.fetch=original;db.close();}
});

test('verification recipient bursts cannot spend owner limits or the shared verification allowance',async()=>{
 const {db,env}=mailFixture(),original=globalThis.fetch;let calls=0;
 try{
  env.VISITOR_EMAIL_DOMAINS='example.com';
  globalThis.fetch=async()=>{calls++;return Response.json({id:'receipt'})};
  db.exec("INSERT INTO owner_accounts VALUES ('o','owner@example.com',NULL,'active',0)");
  for(let i=0;i<10;i++)await sendMail(env,'owner@example.com','Code','body');
  for(let i=0;i<65;i++)await assert.rejects(sendMail(env,'owner@example.com','Code','body'),RateLimitError);
  await sendMail(env,'owner@example.com','Invite','body','owner');
  await sendMail(env,'owner@example.com','Reset','body','owner-reset');
  for(let i=0;i<50;i++)await sendMail(env,`other${i}@example.com`,'Code','body');
  assert.equal(calls,62,'Rejected recipient bursts must not burn the verification budget');
  await assert.rejects(sendMail(env,'last@example.com','Code','body'),RateLimitError);
 }finally{globalThis.fetch=original;db.close();}
});

test('reset requests cannot use the invitation reserve; daily reservations remain bounded under concurrency',async()=>{
 const {db,env}=mailFixture(),original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({id:'receipt'})};
  for(let i=0;i<12;i++)db.prepare("INSERT INTO owner_accounts VALUES (?,?,NULL,'invited',0)").run('o'+i,`owner${i}@example.com`);
  const sends=await Promise.allSettled(Array.from({length:12},(_,i)=>sendMail(env,`owner${i}@example.com`,'Reset','body','owner-reset')));
  assert.equal(sends.filter(x=>x.status==='fulfilled').length,5);
  assert.ok(sends.filter(x=>x.status==='rejected').every(x=>x.reason instanceof RateLimitError));
  for(let i=0;i<5;i++)await sendMail(env,`owner${i}@example.com`,'Invite','body','owner');
  await assert.rejects(sendMail(env,'owner5@example.com','Invite','body','owner'),RateLimitError);
  assert.equal(calls,10);
  db.exec('UPDATE request_limits SET expires_at=0');
  await sendMail(env,'owner0@example.com','Reset','body','owner-reset');
  assert.equal(calls,11,'Expired fixed windows permit a new send');
 }finally{globalThis.fetch=original;db.close();}
});

test('owner reset recipients have a separate three-per-hour bound',async()=>{
 const {db,env}=mailFixture(),original=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;return Response.json({id:'receipt'})};
  db.exec("INSERT INTO owner_accounts VALUES ('o','owner@example.com',NULL,'active',0)");
  for(let i=0;i<3;i++)await sendMail(env,'owner@example.com','Reset','body','owner-reset');
  await assert.rejects(sendMail(env,'owner@example.com','Reset','body','owner-reset'),RateLimitError);
  await sendMail(env,'owner@example.com','Invite','body','owner');
  assert.equal(calls,4);
 }finally{globalThis.fetch=original;db.close();}
});
