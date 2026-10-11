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
  for(const table of ['email_outbox','access_jobs','identity_attempts','agent_credentials'])assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
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
