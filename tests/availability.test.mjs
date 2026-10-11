import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {availableSlots,uniqueInstant,validatePeriod,visitorWindow} from '../src/lib/viewings/availability.ts';
import {readActivity} from '../src/server/activity.ts';
import {readCalendar,changeCalendar,CalendarConflict} from '../src/server/availability.ts';
const period=(kind='available',start=540,end=1020,extra={})=>({id:'p',kind,start_minute:start,end_minute:end,weekday:-1,local_day:null,...extra});
const slots=(ps,day='2026-10-12')=>availableSlots(ps,day,day,0);
test('empty calendar, union of rules, full containment, all block types win, removal only restores permitted time',()=>{
 assert.deepEqual(slots([]),[]);
 assert.equal(slots([period()]).length,8);
 assert.equal(slots([period(),period()]).length,8);
 assert.equal(slots([period('available',555,615)]).length,0);
 assert.equal(slots([period('available',540,570),period('available',570,600)]).length,1);
 const block=period('blocked',585,615,{local_day:'2026-10-12',weekday:null});
 assert.equal(slots([period(),block]).length,6);
 assert.equal(slots([period(),block,period('available',540,660,{local_day:'2026-10-12',weekday:null})]).length,6);
 assert.equal(slots([block]).length,0);
 assert.equal(slots([period(),period('blocked',0,1440)]).length,0);
 assert.equal(slots([period('available',540,600,{weekday:2})]).length,0);
 assert.equal(slots([period('available',540,600,{weekday:1})]).length,1);
 assert.equal(slots([period('available',540,600,{local_day:'2026-10-13',weekday:null})]).length,0);
});
test('NY boundaries, spring gaps and fall folds are excluded without shifting; UTC independent of machine timezone',()=>{
 assert.equal(uniqueInstant('2026-01-12',540),Date.parse('2026-01-12T14:00:00Z'));
 assert.equal(uniqueInstant('2026-07-12',540),Date.parse('2026-07-12T13:00:00Z'));
 assert.equal(uniqueInstant('2026-03-08',120),null);
 assert.equal(uniqueInstant('2026-11-01',60),null);
 assert.equal(uniqueInstant('2026-12-31',1440),Date.parse('2027-01-01T05:00:00Z'));
 assert.deepEqual(slots([period('available',0,240)],'2026-03-08').map(s=>s.start),['00:00','03:00']);
 assert.deepEqual(slots([period('available',0,240)],'2026-11-01').map(s=>s.start),['02:00','03:00']);
 const last=slots([period('available',1380,1440)],'2026-12-31')[0];assert.equal(last.endsAt-last.startsAt,3600000);
 assert.equal(availableSlots([period()],'2026-10-12','2026-10-12',Date.parse('2026-10-12T13:00:00Z')).length,7);
});
test('validate dates, horizons, quarter-hour input and overnight ranges',()=>{
 for(const p of [period('available',600,600),period('available',1020,540),period('available',-15,600),period('available',1,600),period('available',0,1441),period('bad'),period('available',0,60,{local_day:'2026-02-30',weekday:null}),period('available',0,60,{weekday:7})])assert.throws(()=>validatePeriod(p));
 assert.doesNotThrow(()=>validatePeriod(period('available',0,1440)));
 assert.throws(()=>availableSlots([],'2026-01-01','2026-03-01'));
 const now=Date.parse('2026-10-13T02:00Z');
 assert.deepEqual(visitorWindow('2026-10-12','2026-10-13',now),{from:'2026-10-12',to:'2026-10-13'});
 assert.throws(()=>visitorWindow('2026-10-11','2026-10-13',now));
});
function fixture(path){
 const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');
 function stmt(sql,args=[]){return {bind(...v){return stmt(sql,v)},async all(){return {results:db.prepare(sql).all(...args)}},run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}};}
 const env={DB:{prepare:stmt,async batch(ss){db.exec('BEGIN');try{const r=ss.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 return {db,env};
}
test('migration and data layer persist across connections, reject stale/removed owners, and audit atomic before/after changes',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rb-calendar-')),path=join(dir,'db.sqlite');let {db,env}=fixture(path);
 try{
  for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+f,'utf8'));
  db.exec("INSERT INTO owner_accounts VALUES ('a','a@example.com','aa','active',0),('b','b@example.com','bb','active',0),('removed','removed@example.com','rr','removed',0)");
  assert.deepEqual(await readCalendar(env),{revision:0,periods:[],holds:[]});
  await changeCalendar(env,'a',{revision:0,action:'add',period:period()});
  db.close();({db,env}=fixture(path));
  const shared=await readCalendar(env);assert.equal(shared.revision,1);assert.equal(shared.periods.length,1);
  await assert.rejects(changeCalendar(env,'b',{revision:0,action:'add',period:period('blocked')}),CalendarConflict);
  await assert.rejects(changeCalendar(env,'removed',{revision:1,action:'add',period:period('blocked')}),CalendarConflict);
  const competing=await Promise.allSettled(['a','b'].map(owner=>changeCalendar(env,owner,{revision:1,action:'add',period:period('blocked',600,660)})));
  assert.equal(competing.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(slots((await readCalendar(env)).periods).length,7);
  const block=(await readCalendar(env)).periods.find(p=>p.kind==='blocked');
  await changeCalendar(env,'b',{revision:2,action:'update',id:block.id,period:period('blocked',600,720)});
  assert.equal(slots((await readCalendar(env)).periods).length,6);
  await changeCalendar(env,'b',{revision:3,action:'remove',id:block.id});
  assert.equal(slots((await readCalendar(env)).periods).length,8);
  const audit=db.prepare('SELECT * FROM calendar_audit ORDER BY revision').all();assert.equal(audit.length,4);assert.equal(audit[2].actor_id,'b');assert.equal(JSON.parse(audit[2].before_json).end_minute,660);assert.equal(JSON.parse(audit[2].after_json).end_minute,720);
  assert.equal(audit[3].after_json,null);
  db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run('invite','a','owner_invited','b',Date.now()+1000);
  const activity=await readActivity(env);
  assert.equal(activity.length,5);assert.equal(activity[0].title,'Owner invited');assert.equal(activity[0].actor,'a@example.com');assert.equal(activity[0].detail,'b@example.com');
  const edited=activity.find(a=>a.title==='Calendar period updated');assert.match(edited.detail,/Every day/);assert.match(edited.detail,/→/);assert.equal(edited.actor,'b@example.com');
  assert.ok(!JSON.stringify(activity).includes('password'));assert.ok(!JSON.stringify(activity).includes('mutation_id'));
  for(let i=0;i<55;i++)db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run('event-'+i,'a','visitor_demo_enabled','visitor_demo',Date.now()+2000+i);
  const recent=await readActivity(env);assert.equal(recent.length,50);assert.equal(recent[0].id,'event-54');assert.ok(recent.every(a=>a.title==='Visitor demo enabled'));

  // Failure in a later statement must roll back revision AND audit.
  db.exec("CREATE TRIGGER fail_period BEFORE INSERT ON calendar_periods BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  await assert.rejects(changeCalendar(env,'a',{revision:4,action:'add',period:period()}));assert.equal((await readCalendar(env)).revision,4);assert.equal(db.prepare('SELECT COUNT(*) n FROM calendar_audit').get().n,4);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM owner_accounts').get().n,3);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
