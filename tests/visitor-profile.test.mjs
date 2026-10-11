import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {validateProfile,saveProfile,readProfile,ProfileConflict} from '../src/server/visitor-profile.ts';
const profile={role:'agent',display_name:'Example Agent',licensed_name:'Example Agent',jurisdiction:'South Carolina',license_number:'TEST-ONLY',brokerage:'Example Brokerage',revision:0};
test('agent fields are bounded and required; supplied validation flags are ignored',()=>{
 assert.equal(validateProfile({...profile,validation_status:'verified'}).validation_status,undefined);
 for(const field of ['display_name','licensed_name','jurisdiction','license_number','brokerage']){
  assert.throws(()=>validateProfile({...profile,[field]:''}));
  assert.throws(()=>validateProfile({...profile,[field]:'x'.repeat(300)}));
 }
 assert.equal(validateProfile({...profile,role:'buyer'}).license_number,'');
 assert.throws(()=>validateProfile({...profile,role:'administrator'}));
});
test('verified visitor profiles persist, stay isolated and reject stale edits without duplicate audit entries',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const f of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+f,'utf8'));
 db.exec("INSERT INTO visitors(id,email_normalized,email_verified_at,created_at) VALUES ('a','a@example.com',1,0),('b','b@example.com',1,0),('unverified','u@example.com',NULL,0)");
 function stmt(sql,args=[]){return {bind(...v){return stmt(sql,v)},async first(){return db.prepare(sql).get(...args)??null},run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}}};}
 const env={DB:{prepare:stmt,async batch(ss){db.exec('BEGIN');try{const r=ss.map(s=>s.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 try{
  await assert.rejects(saveProfile(env,'unverified',profile),ProfileConflict);
  const saved=await saveProfile(env,'a',{...profile,visitor_id:'b',validation_status:'verified'});
  assert.equal(saved.validation_status,'simulated_pass');assert.equal(saved.revision,1);
  assert.deepEqual({...await readProfile(env,'a')},saved);assert.equal(await readProfile(env,'b'),null);
  await assert.rejects(saveProfile(env,'a',profile),ProfileConflict);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_events').get().n,1);
  await saveProfile(env,'a',{...profile,role:'buyer',revision:1});
  assert.equal((await readProfile(env,'a')).licensed_name,'');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM agent_credentials').get().n,0,'Simulated credentials never populate real verification scaffold');
 }finally{db.close();}
});
