import {queueOwnerMessage,deliverBookingEmail,MessageConflict} from '../src/server/booking-mail.ts';
import {ownerCalendar,calendarSelection} from '../src/server/owner-calendar.ts';
import {uniqueInstant} from '../src/lib/viewings/availability.ts';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {dayKey,plusDays} from '../src/lib/viewings/calendar.ts';
import {changeCalendar,readCalendar,unreservedSlots,CalendarConflict} from '../src/server/availability.ts';
import {saveProfile} from '../src/server/visitor-profile.ts';
import {requestBooking,changeBooking,visitorBookings,BookingConflict} from '../src/server/bookings.ts';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+f,'utf8'));
 db.exec("INSERT INTO owner_accounts VALUES ('owner','owner@example.com','auth','active',0); INSERT INTO visitors(id,email_normalized,email_verified_at,created_at) VALUES ('a','a@example.com',1,0),('b','b@example.com',1,0); UPDATE site_settings SET value='on'");
 function stmt(sql,args=[]){return {bind(...v){return stmt(sql,v)},async first(){return db.prepare(sql).get(...args)??null},async all(){return {results:db.prepare(sql).all(...args)}},run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}};}
 const env={DB:{prepare:stmt,async batch(ss){db.exec('BEGIN');try{const r=ss.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 return {db,env};
}
const profile={role:'agent',display_name:'Test Agent',licensed_name:'Test Agent',jurisdiction:'SC',license_number:'TEST',brokerage:'Example',revision:0};
const period={kind:'available',local_day:null,weekday:-1,start_minute:540,end_minute:1020};
const day=plusDays(dayKey(),1);
test('real request holds slot, preserves profile snapshot, retries safely, requires owner acknowledgment, cancellation restores permitted time',async()=>{
 const {db,env}=fixture();try{
  await saveProfile(env,'a',profile);await changeCalendar(env,'owner',{action:'add',revision:0,period});
  const input={action:'request',day,time:'09:00',request_key:crypto.randomUUID(),agent_attending:true};
  await assert.rejects(requestBooking(env,'a',{...input,agent_attending:false}),/Confirm/);
  const booked=await requestBooking(env,'a',input);assert.equal(booked.status,'requested');
  assert.equal((await requestBooking(env,'a',input)).id,booked.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
  assert.equal(unreservedSlots(await readCalendar(env),day,day).length,7);
  assert.equal((await visitorBookings(env,'b')).length,0);
  await assert.rejects(requestBooking(env,'a',{...input,time:'10:00'}),BookingConflict);
  await assert.rejects(requestBooking(env,'a',{...input,time:'10:00',request_key:crypto.randomUUID()}),BookingConflict);
  await saveProfile(env,'a',{...profile,licensed_name:'Changed later',revision:1});
  assert.equal(JSON.parse(db.prepare('SELECT profile_snapshot FROM bookings').get().profile_snapshot).licensed_name,'Test Agent');
  await assert.rejects(changeBooking(env,{visitorId:'b'},{id:booked.id,revision:1,action:'cancel',reason:'Not mine'}),BookingConflict);
  await assert.rejects(changeBooking(env,{ownerId:'owner'},{id:booked.id,revision:1,action:'approve'}),/Acknowledge/);
  await changeBooking(env,{ownerId:'owner'},{id:booked.id,revision:1,action:'approve',acknowledge_simulation:true});
  await assert.rejects(changeBooking(env,{ownerId:'owner'},{id:booked.id,revision:1,action:'cancel',reason:'Stale edit'}),BookingConflict);
  const state=await readCalendar(env);
  await assert.rejects(changeCalendar(env,'owner',{action:'add',revision:state.revision,period:{...period,kind:'blocked',local_day:day,weekday:null}}),CalendarConflict);
  db.exec("UPDATE site_settings SET value='off'");
  await assert.rejects(changeBooking(env,{visitorId:'a'},{id:booked.id,revision:2,action:'cancel',reason:'Paused visitor'}),BookingConflict);
  await changeBooking(env,{ownerId:'owner'},{id:booked.id,revision:2,action:'cancel',reason:'Owner canceled test visit'});
  assert.equal(unreservedSlots(await readCalendar(env),day,day).length,8);
  const latest=await readCalendar(env);await changeCalendar(env,'owner',{action:'remove',revision:latest.revision,id:latest.periods[0].id});
  assert.equal(unreservedSlots(await readCalendar(env),day,day).length,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,2);
  for(const table of ['access_jobs','identity_attempts','agent_credentials'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
 }finally{db.close();}
});
test('competing visitors and double clicks create exactly one hold; paused booking and stale calendar checks fail closed',async()=>{
 const {db,env}=fixture();try{
  for(const v of ['a','b'])await saveProfile(env,v,{...profile,role:'buyer'});
  await changeCalendar(env,'owner',{action:'add',revision:0,period});
  const input={day,time:'09:00',request_key:crypto.randomUUID()};
  const results=await Promise.allSettled(['a','b'].map(v=>requestBooking(env,v,{...input,request_key:crypto.randomUUID()})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
  const saved=db.prepare('SELECT * FROM bookings').get();await changeBooking(env,{ownerId:'owner'},{id:saved.id,revision:1,action:'cancel',reason:'Retry test'});
  const retryInput={day,time:'10:00',request_key:crypto.randomUUID()};
  const retries=await Promise.all([requestBooking(env,'a',retryInput),requestBooking(env,'a',retryInput)]);assert.equal(retries[0].id,retries[1].id);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='booking_requested'").get().n,2);
  db.exec("UPDATE site_settings SET value='off'");await assert.rejects(requestBooking(env,'b',{day,time:'11:00',request_key:crypto.randomUUID()}),BookingConflict);
 }finally{db.close();}
});
test('calendar edits racing a booking cannot invalidate a committed hold',async()=>{
 const {db,env}=fixture();try{
  await saveProfile(env,'a',{...profile,role:'buyer'});await changeCalendar(env,'owner',{action:'add',revision:0,period});
  const result=await Promise.allSettled([
   requestBooking(env,'a',{day,time:'09:00',request_key:crypto.randomUUID()}),
   changeCalendar(env,'owner',{action:'add',revision:1,period:{kind:'blocked',local_day:day,weekday:null,start_minute:0,end_minute:1440}}),
  ]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  const state=await readCalendar(env);
  if(result[0].status==='fulfilled'){assert.equal(state.holds.length,1);assert.equal(state.periods.length,1);}
  else{assert.equal(state.holds.length,0);assert.equal(unreservedSlots(state,day,day).length,0);}
 }finally{db.close();}
});

test('owner messages require a future active request and current active owner; retries do not duplicate mail or audit',async()=>{
 const {db,env}=fixture();try{
  env.APP_ORIGIN='http://localhost';
  await saveProfile(env,'a',{...profile,role:'buyer'});await changeCalendar(env,'owner',{action:'add',revision:0,period});
  const b=await requestBooking(env,'a',{day,time:'09:00',request_key:crypto.randomUUID()});
  const input={id:b.id,revision:1,request_key:crypto.randomUUID(),message:'Please arrive at your scheduled time.'};
  await assert.rejects(queueOwnerMessage(env,'stranger',input),MessageConflict);
  await assert.rejects(queueOwnerMessage(env,'owner',{...input,revision:2}),MessageConflict);
  const ids=await Promise.all([queueOwnerMessage(env,'owner',input),queueOwnerMessage(env,'owner',input)]);
  assert.equal(ids[0],ids[1]);assert.equal(db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='booking_message_queued'").get().n,1);
  await assert.rejects(queueOwnerMessage(env,'owner',{...input,message:'Changed contents'}),MessageConflict);
  let calls=0;const send=async(to,subject,text,key)=>{calls++;assert.equal(to,'a@example.com');assert.match(text,/Please arrive/);assert.match(key,/message:owner:/);return 'receipt';};
  await Promise.all(ids.map(id=>deliverBookingEmail(env,id,send)));assert.equal(calls,1);
  await changeBooking(env,{ownerId:'owner'},{id:b.id,revision:1,action:'cancel',reason:'Please choose another time.'});
  await assert.rejects(queueOwnerMessage(env,'owner',{...input,revision:2,request_key:crypto.randomUUID()}),MessageConflict);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM booking_cancellations').get().n,1);
 }finally{db.close();}
});
test('notification commit, safe preflight retry, ambiguous acceptance and superseded mail',async()=>{
 const {db,env}=fixture();try{
  env.APP_ORIGIN='http://localhost';
  await saveProfile(env,'a',{...profile,role:'buyer'});await changeCalendar(env,'owner',{action:'add',revision:0,period});
  const b=await requestBooking(env,'a',{day,time:'09:00',request_key:crypto.randomUUID()});
  const approved=await changeBooking(env,{ownerId:'owner'},{id:b.id,revision:1,action:'approve',acknowledge_simulation:true});
  assert.equal(db.prepare('SELECT booking_revision FROM email_outbox').get().booking_revision,2);
  let sends=0;
  assert.equal(await deliverBookingEmail(env,approved.emailId,async()=>{throw Error('Preflight restriction')}),'failed');
  assert.equal(await deliverBookingEmail(env,approved.emailId,async()=>{sends++;throw Object.assign(Error('Ambiguous timeout'),{uncertain:true})}),'uncertain');
  await deliverBookingEmail(env,approved.emailId,async()=>{sends++;return 'must-not-send'});assert.equal(sends,1);
  const msg=await queueOwnerMessage(env,'owner',{id:b.id,revision:2,request_key:crypto.randomUUID(),message:'Pending message before cancel'});
  const canceled=await changeBooking(env,{ownerId:'owner'},{id:b.id,revision:2,action:'cancel',reason:'Please pick another available slot.'});
  assert.equal(db.prepare('SELECT status FROM email_outbox WHERE id=?').get(msg).status,'canceled');
  await deliverBookingEmail(env,msg,async()=>{assert.fail('Superseded message must not send')});
  assert.equal(await deliverBookingEmail(env,canceled.emailId,async(to,subject,text)=>{assert.match(subject,/canceled/);assert.match(text,/Please pick another available slot/);assert.match(text,/Eastern Time/);return 'cancellation-receipt'}),'sent');
  assert.equal(db.prepare('SELECT provider_message_id FROM email_outbox WHERE id=?').get(canceled.emailId).provider_message_id,'cancellation-receipt');
  const privateView=await visitorBookings(env,'a');assert.ok(!('payload_json' in privateView[0]));
 }finally{db.close();}
});
test('a crash after provider acceptance is never treated as a retryable failure',async()=>{
 const {db,env}=fixture();try{
  await saveProfile(env,'a',{...profile,role:'buyer'});await changeCalendar(env,'owner',{action:'add',revision:0,period});
  const b=await requestBooking(env,'a',{day,time:'09:00',request_key:crypto.randomUUID()});
  const approved=await changeBooking(env,{ownerId:'owner'},{id:b.id,revision:1,action:'approve',acknowledge_simulation:true});
  const original=env.DB.prepare;env.DB.prepare=sql=>sql.includes("SET status='sent'")?{bind(){return {run(){throw Error('Lost DB connection')}}}}:original(sql);
  await assert.rejects(deliverBookingEmail(env,approved.emailId,async()=> 'accepted'),/Lost DB/);
  env.DB.prepare=original;
  assert.equal(db.prepare('SELECT status FROM email_outbox').get().status,'sending');
  await deliverBookingEmail(env,approved.emailId,async()=>{assert.fail('Unknown outcome is not retryable')});
 }finally{db.close();}
});
test('owner calendar uses Eastern dates, includes both statuses and has no latest-100 cutoff',async()=>{
 const {db,env}=fixture();try{
  // Future relative to the injected clock; spans spring DST and UTC date boundaries.
  for(let n=0;n<110;n++){
   const local=plusDays('2030-03-01',Math.floor(n/5)),start=uniqueInstant(local,(19+n%5)*60),id='calendar-'+n;
   db.prepare("INSERT INTO availability_slots VALUES (?,?,?,'owner_coordinated',1)").run(id,start,start+3600000);
   db.prepare("INSERT INTO bookings(id,visitor_id,slot_id,starts_at,ends_at,mode,source,referral_verified,agent_attending,status,revision,created_at) VALUES (?,'a',?,?,?,'owner_coordinated','public',0,0,?,1,0)").run(id,id,start,start+3600000,n%2?'approved':'requested');
  }
  const c=await ownerCalendar(env,new URLSearchParams('month=2030-03&day=2030-03-10'),Date.parse('2030-03-01T00:00Z'));
  assert.equal(c.pending,55);assert.equal(c.approved,55);assert.equal(c.bookings.length,5);
  assert.deepEqual(c.markers['2030-03-01'],{pending:3,approved:2});
  assert.deepEqual(c.markers['2030-03-10'],{pending:2,approved:3});
  assert.ok(c.bookings.every(b=>dayKey(b.starts_at)==='2030-03-10'));
  assert.equal(Object.values(c.markers).reduce((n,m)=>n+m.pending+m.approved,0),110);
  assert.equal(calendarSelection(new URLSearchParams('month=bad&day=2030-02-30'),Date.parse('2030-03-01T02:00Z')).day,'2030-02-28');
  assert.equal(calendarSelection(new URLSearchParams('month=2030-03&day=2030-04-01')).day,'2030-03-01');
 }finally{db.close();}
});

test('notification storage failure rolls back approval and its audit; expired requests cannot receive messages',async()=>{
 const {db,env}=fixture();try{
  await saveProfile(env,'a',{...profile,role:'buyer'});await changeCalendar(env,'owner',{action:'add',revision:0,period});
  const b=await requestBooking(env,'a',{day,time:'09:00',request_key:crypto.randomUUID()});
  const before=await readCalendar(env);
  db.exec("CREATE TRIGGER fail_fixture_outbox BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'fixture outbox unavailable'); END");
  await assert.rejects(changeBooking(env,{ownerId:'owner'},{id:b.id,revision:1,action:'approve',acknowledge_simulation:true}),/fixture outbox/);
  assert.equal(db.prepare('SELECT status FROM bookings').get().status,'requested');
  assert.equal((await readCalendar(env)).revision,before.revision);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='booking_approved'").get().n,0);
  db.exec('DROP TRIGGER fail_fixture_outbox');
  db.prepare('UPDATE bookings SET starts_at=?,ends_at=? WHERE id=?').run(Date.now()-7200000,Date.now()-3600000,b.id);
  await assert.rejects(queueOwnerMessage(env,'owner',{id:b.id,revision:1,request_key:crypto.randomUUID(),message:'Too late to initiate'}),MessageConflict);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);
 }finally{db.close();}
});
