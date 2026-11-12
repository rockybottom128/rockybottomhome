import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/d1.mjs';
import {reviewEmail,recoveryList,recoveryHistory,RecoveryConflict,RecoveryValidation} from '../src/server/email-recovery.ts';
import {deliverBookingEmail,bookingEmails} from '../src/server/booking-mail.ts';
import {deliverReport,reportHistory} from '../src/server/punch-reports.ts';
import {ownerCalendar} from '../src/server/owner-calendar.ts';
import {recoveryLabel} from '../src/lib/email-recovery.ts';
const now=Date.now(),stale=now-15*60000;
function setup(){
 const f=fixture();f.env.APP_ORIGIN='https://fixture.example.com';f.env.MAIL_MODE='test';
 f.db.exec(`INSERT INTO owner_accounts VALUES ('a','a@example.com',NULL,'active',0),('b','b@example.com',NULL,'active',0);
 INSERT INTO visitors(id,email_normalized,email_verified_at,created_at) VALUES ('v','v@example.com',1,0);
 INSERT INTO availability_slots VALUES ('slot',1,2,'owner_coordinated',1);`);
 f.db.prepare("INSERT INTO bookings(id,visitor_id,slot_id,starts_at,ends_at,mode,source,status,created_at) VALUES ('booking','v','slot',?,?,'owner_coordinated','public','approved',0)").run(now+86400000,now+86500000);
 f.db.prepare("INSERT INTO email_outbox(id,booking_id,booking_revision,kind,deduplication_key,due_at,status,payload_json,created_at,attempted_at) VALUES ('mail','booking',1,'confirmation','dedup',0,'sending',?,0,?)").run(JSON.stringify({subject:'Subject',text:'Original email'}),stale);
 f.db.prepare("INSERT INTO punch_reports VALUES ('report','a',0,?,?)").run(JSON.stringify({timeZone:'America/New_York',sort:'created',direction:'desc',includeCompleted:'false'}),JSON.stringify([{label:'Original task',created_at:0,completed_at:null,creator_email:'a@example.com',completed_email:null}]));
 f.db.prepare("INSERT INTO punch_report_deliveries(id,report_id,recipient,include_attribution,status,attempted_at) VALUES ('recipient','report','v@example.com',0,'sending',?)").run(stale);
 return f;
}
const input=(kind='booking',overrides={})=>({kind,id:kind==='booking'?'mail':'recipient',revision:0,outcome:'flagged',request_key:crypto.randomUUID(),...overrides});
const review=(kind,outcome='accepted',revision=1)=>input(kind,{revision,outcome,evidence:'Checked the provider event record at the attempt time.',provider_receipt:'provider-receipt-123',confirmed:true});
test('15-minute boundary, missing attempt time and unsupported states cannot be overridden',async()=>{
 const {db,env}=setup();try{
  for(const kind of ['booking','report']){
   await assert.rejects(reviewEmail(env,'a',input(kind),now-1),RecoveryConflict);
   await reviewEmail(env,'a',input(kind),now);
   await assert.rejects(reviewEmail(env,'a',input(kind,{revision:1}),now),RecoveryConflict);
  }
  db.exec("UPDATE email_outbox SET status='sending',attempted_at=NULL,recovery_revision=0");
  await assert.rejects(reviewEmail(env,'a',input(),now),RecoveryConflict);
  for(const state of ['pending','failed','sent','canceled']){
   db.prepare('UPDATE email_outbox SET status=?').run(state);
   await assert.rejects(reviewEmail(env,'a',review('booking','unknown',0),now),RecoveryConflict);
  }
  assert.equal(db.prepare('SELECT count(*) n FROM email_recovery_reviews').get().n,2);
 }finally{db.close();}
});
test('reviews preserve payloads, remain non-retryable, and retain corrections and reviewer attribution',async()=>{
 const {db,env}=setup();try{
  const original=db.prepare('SELECT payload_json FROM email_outbox').get().payload_json;
  for(const kind of ['booking','report']){
   await reviewEmail(env,'a',input(kind),now);
   await reviewEmail(env,'b',review(kind),now+1);
   await reviewEmail(env,'a',review(kind,'not_accepted',2),now+2);
   const history=await recoveryHistory(env,'b',kind,kind==='booking'?'mail':'recipient');
   assert.deepEqual(history.map(h=>h.outcome),['not_accepted','accepted','flagged']);
   assert.equal(history[1].reviewer,'b@example.com');assert.equal(history[1].provider_receipt,'provider-receipt-123');
  }
  let sends=0;const send=async()=>{sends++;return 'new-receipt';};
  assert.equal(await deliverBookingEmail(env,'mail',send),'uncertain');
  await deliverReport(env,'a','report',send);assert.equal(sends,0);
  assert.equal(db.prepare('SELECT payload_json FROM email_outbox').get().payload_json,original);
  assert.equal((await bookingEmails(env,['booking']))[0].recovery_outcome,'not_accepted');
  assert.equal((await reportHistory(env,'a'))[0].canSend,false);
  assert.equal((await ownerCalendar(env,new URLSearchParams(),now)).attention,0);
  assert.match(recoveryLabel('accepted'),/inbox delivery unconfirmed/);
  await reviewEmail(env,'a',review('booking','unknown',3),now+3);
  assert.equal((await ownerCalendar(env,new URLSearchParams(),now)).attention,1,'Unknown reviews still need attention');
 }finally{db.close();}
});
test('duplicate requests audit once; competing owners and altered replays conflict',async()=>{
 const {db,env}=setup();try{
  const flag=input();await Promise.all([reviewEmail(env,'a',flag,now),reviewEmail(env,'a',flag,now)]);
  assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,1);
  await assert.rejects(reviewEmail(env,'a',{...flag,outcome:'unknown',evidence:'Different details'},now),RecoveryConflict);
  const outcomes=await Promise.allSettled([reviewEmail(env,'a',review('booking'),now+1),reviewEmail(env,'b',review('booking','not_accepted'),now+1)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(db.prepare('SELECT recovery_revision FROM email_outbox').get().recovery_revision,2);
  assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,2);
 }finally{db.close();}
});
test('validation, removed owners and transactional failure leave delivery and audit unchanged',async()=>{
 const {db,env}=setup();try{
  for(const invalid of [{kind:'other'},{id:'bad\n'},{revision:-1},{outcome:'resend'},{request_key:'bad'}])await assert.rejects(reviewEmail(env,'a',input('booking',invalid),now),RecoveryValidation);
  await reviewEmail(env,'a',input(),now);
  for(const invalid of [{evidence:''},{confirmed:false},{provider_receipt:''}])await assert.rejects(reviewEmail(env,'a',{...review('booking'),...invalid},now),RecoveryValidation);
  db.exec("UPDATE owner_accounts SET status='removed' WHERE id='b'");
  await assert.rejects(reviewEmail(env,'b',review('booking'),now),RecoveryConflict);
  db.exec("CREATE TRIGGER break_review BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(reviewEmail(env,'a',review('booking'),now),/fixture failure/);
  assert.equal(db.prepare('SELECT count(*) n FROM email_recovery_reviews').get().n,1);
  assert.equal(db.prepare('SELECT recovery_revision FROM email_outbox').get().recovery_revision,1);
 }finally{db.close();}
});
test('late sender success or failure cannot overwrite a review or enable retry',async()=>{
 for(const kind of ['booking','report'])for(const fails of [false,true]){
  const {db,env}=setup();try{
   const table=kind==='booking'?'email_outbox':'punch_report_deliveries';db.exec(`UPDATE ${table} SET status='pending'`);
   let sends=0;
   const send=async()=>{
    sends++;
    // Advance the review clock to simulate a delayed sender returning after review.
    await reviewEmail(env,'a',input(kind),Date.now()+16*60000);
    await reviewEmail(env,'b',review(kind,'not_accepted'),Date.now()+16*60000);
    if(fails)throw Error('late failure');return 'late-receipt';
   };
   if(kind==='booking')assert.equal(await deliverBookingEmail(env,'mail',send),'uncertain');else await deliverReport(env,'a','report',send);
   assert.equal(db.prepare(`SELECT recovery_outcome FROM ${table}`).get().recovery_outcome,'not_accepted');
   assert.equal(db.prepare(`SELECT status FROM ${table}`).get().status,'uncertain');assert.equal(sends,1);
  }finally{db.close();}
 }
});
test('owner access is checked again inside the atomic write',async()=>{
 const {db,env}=setup();try{
  const batch=env.DB.batch;
  env.DB.batch=async statements=>{db.exec("UPDATE owner_accounts SET status='removed' WHERE id='b'");return batch(statements);};
  await assert.rejects(reviewEmail(env,'b',input(),now),RecoveryConflict);
  assert.equal(db.prepare('SELECT count(*) n FROM email_recovery_reviews').get().n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM audit_events').get().n,0);
  assert.equal(db.prepare('SELECT status FROM email_outbox').get().status,'sending');
 }finally{db.close();}
});
test('review list prioritizes unresolved outcomes and reports a bounded page',async()=>{
 const {db,env}=setup();try{
  await reviewEmail(env,'a',input(),now);await reviewEmail(env,'a',review('booking'),now);
  const list=await recoveryList(env,'a',now);assert.equal(list.items[0].kind,'report');assert.equal(list.items[0].canFlag,true);
  assert.equal(list.items[1].canReview,true);assert.equal(list.items[1].recovery_outcome,'accepted');
  for(let i=0;i<105;i++)db.prepare("INSERT INTO punch_report_deliveries(id,report_id,recipient,include_attribution,status,attempted_at) VALUES (?,'report',?,0,'uncertain',?)").run('r'+i,'r'+i+'@example.com',stale);
  const page=await recoveryList(env,'a',now);assert.equal(page.items.length,100);assert.equal(page.hasMore,true);
 }finally{db.close();}
});
