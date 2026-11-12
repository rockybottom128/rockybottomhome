import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/d1.mjs';
import {cleanupExpiredRecords,maybeCleanupExpiredRecords} from '../src/server/expired-records.ts';
const now=1800000000000,day=86400000;
function visitor(db,id,{verified=null,created=now-3*day,requested=null}={}){
 db.prepare('INSERT INTO visitors(id,email_normalized,email_verified_at,created_at,last_verification_requested_at) VALUES (?,?,?,?,?)').run(id,id+'@example.com',verified,created,requested);
}
function challenge(db,id,expires=now-2*day,sent=now-3*day){
 db.prepare("INSERT INTO email_challenges(visitor_id,generation,code_digest,expires_at,last_sent_at,delivery) VALUES (?,?,?,?,?,'sent')").run(id,'generation-'+id,'digest',expires,sent);
}
const ids=(db,table,column='id')=>db.prepare(`SELECT ${column} id FROM ${table} ORDER BY ${column}`).all().map(r=>r.id);
test('cleanup removes expired auth records but retains active limits, sessions and recent challenges',async()=>{
 const {db,env}=fixture();try{
  visitor(db,'verified',{verified:1});visitor(db,'old');visitor(db,'live');visitor(db,'recent');
  challenge(db,'old');challenge(db,'live',now+1);challenge(db,'recent',now-1,now-60001);
  db.exec("INSERT INTO auth_user(id,name,email,created_at,updated_at) VALUES ('owner','Owner','owner@example.com',0,0)");
  for(const [id,expires] of [['expired',now],['live',now+1]]){
   db.prepare('INSERT INTO request_limits VALUES (?,5,?)').run(id,expires);
   db.prepare('INSERT INTO visitor_sessions(token_digest,visitor_id,expires_at,challenge_generation) VALUES (?,\'verified\',?,?)').run(id,expires,id);
   db.prepare('INSERT INTO auth_session(id,expires_at,token,created_at,updated_at,user_id) VALUES (?,?,?,0,0,\'owner\')').run(id,expires,id);
   db.prepare('INSERT INTO auth_verification VALUES (?,?,?, ?,0,0)').run(id,id,id,expires);
  }
  db.prepare('INSERT INTO auth_rate_limit VALUES (?,?,1,?)').run('old','old',now-day-1);
  db.prepare('INSERT INTO auth_rate_limit VALUES (?,?,1,?)').run('recent','recent',now-60000);
  await cleanupExpiredRecords(env,now);
  assert.deepEqual(ids(db,'visitor_sessions','token_digest'),['live']);
  assert.deepEqual(ids(db,'auth_session'),['live']);assert.deepEqual(ids(db,'auth_verification'),['live']);
  assert.deepEqual(ids(db,'auth_rate_limit'),['recent']);
  assert.equal(db.prepare("SELECT count FROM request_limits WHERE key='live'").get().count,5);
  assert.equal(db.prepare("SELECT count FROM request_limits WHERE key='expired'").get(),undefined);
  assert.deepEqual(ids(db,'email_challenges','visitor_id'),['live','recent']);
  assert.deepEqual(ids(db,'visitors'),['live','recent','verified']);
  assert.equal(db.prepare('SELECT count(*) n FROM auth_user').get().n,1);
 }finally{db.close();}
});
test('abandoned cleanup preserves recent requests, verified visitors and business/audit history',async()=>{
 const {db,env}=fixture();try{
  for(const id of ['abandoned','verified','recent','requesting','booking','thread','profile','agent','identity','audit-subject','audit-actor','session','live-challenge'])visitor(db,id);
  db.prepare("UPDATE visitors SET email_verified_at=1 WHERE id='verified'").run();
  db.prepare("UPDATE visitors SET created_at=? WHERE id='recent'").run(now-day);
  db.prepare("UPDATE visitors SET last_verification_requested_at=? WHERE id='requesting'").run(now);
  challenge(db,'abandoned');challenge(db,'requesting');challenge(db,'live-challenge',now+60000,now);
  db.exec("INSERT INTO owner_accounts VALUES ('owner','owner@example.com',NULL,'active',0)");
  db.exec("INSERT INTO availability_slots VALUES ('slot',10,20,'owner_coordinated',1)");
  db.exec("INSERT INTO bookings(id,visitor_id,slot_id,starts_at,ends_at,mode,source,status,created_at) VALUES ('booking','booking','slot',10,20,'owner_coordinated','public','completed',0)");
  db.exec("INSERT INTO conversation_threads VALUES ('thread','thread',NULL,'Subject','needs_owner',1,0,0,'owner','owner','retry')");
  db.exec("INSERT INTO visitor_intake_profiles(visitor_id,role,display_name,validation_status,revision,updated_at) VALUES ('profile','buyer','Name','simulated_pass',1,0)");
  db.exec("INSERT INTO agent_credentials(visitor_id,licensed_name,jurisdiction,license_number,brokerage) VALUES ('agent','Name','SC','123','Broker')");
  db.exec("INSERT INTO identity_attempts(id,visitor_id,idempotency_key,status,created_at,updated_at) VALUES ('identity','identity','key','canceled',0,0)");
  db.exec("INSERT INTO audit_events VALUES ('audit-1','owner','test','audit-subject',0),('audit-2','audit-actor','test','other',0)");
  db.prepare("INSERT INTO visitor_sessions(token_digest,visitor_id,expires_at) VALUES ('session','session',?)").run(now+1);
  db.exec("INSERT INTO email_outbox(id,kind,deduplication_key,due_at,status) VALUES ('outbox','owner_alert','key',0,'sending')");
  const preserved=['owner_accounts','bookings','conversation_threads','visitor_intake_profiles','agent_credentials','identity_attempts','audit_events','email_outbox','calendar_audit','visitor_allowlist_audit'];
  const before=preserved.map(table=>db.prepare('SELECT * FROM '+table).all());
  await cleanupExpiredRecords(env,now);
  assert.equal(db.prepare("SELECT id FROM visitors WHERE id='abandoned'").get(),undefined);
  assert.equal(db.prepare('SELECT count(*) n FROM visitors').get().n,12);
  assert.deepEqual(preserved.map(table=>db.prepare('SELECT * FROM '+table).all()),before);
  assert.equal(db.prepare("SELECT id FROM visitors WHERE id='requesting'").get().id,'requesting','A fresh request keeps an old unverified registration alive');
 }finally{db.close();}
});
test('shared lease permits one sweep and each sweep deletes at most 100 rows per table',async()=>{
 const {db,env}=fixture();try{
  for(let i=0;i<105;i++){
   visitor(db,'old-'+i);challenge(db,'old-'+i);
   db.prepare('INSERT INTO request_limits VALUES (?,1,?)').run('old-'+i,now-1);
  }
  const results=await Promise.all([cleanupExpiredRecords(env,now),cleanupExpiredRecords(env,now)]);
  assert.equal(results.filter(Boolean).length,1);
  for(const table of ['visitors','email_challenges'])assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,5);
  assert.equal(db.prepare("SELECT count(*) n FROM request_limits WHERE key LIKE 'old-%'").get().n,5);
  assert.equal(await cleanupExpiredRecords(env,now+15*60000-1),false);
  assert.equal(await cleanupExpiredRecords(env,now+15*60000),true);
  assert.equal(db.prepare('SELECT count(*) n FROM visitors').get().n,0);
 }finally{db.close();}
});
test('failure rolls back the whole cleanup batch and background errors remain private',async()=>{
 const {db,env}=fixture(),warnings=[],warn=console.warn;try{
  visitor(db,'abandoned');challenge(db,'abandoned');
  db.exec("CREATE TRIGGER prevent_test_delete BEFORE DELETE ON visitors BEGIN SELECT RAISE(ABORT,'private database error'); END");
  await assert.rejects(cleanupExpiredRecords(env,now),/private database error/);
  assert.equal(db.prepare('SELECT count(*) n FROM email_challenges').get().n,1,'Child deletion rolled back');
  assert.equal(await cleanupExpiredRecords(env,now+1),false,'Failure still respects the shared lease');
  let calls=0;
  const broken={DB:{prepare(){calls++;throw Error('private connection details');}}};
  console.warn=(...args)=>warnings.push(args.join(' '));
  await maybeCleanupExpiredRecords(broken);await maybeCleanupExpiredRecords(broken);
  assert.equal(calls,1);assert.deepEqual(warnings,['Expired-record cleanup could not be completed.']);
 }finally{console.warn=warn;db.close();}
});
