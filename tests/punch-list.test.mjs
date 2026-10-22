import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {fixture} from './helpers/d1.mjs';
import {changePunchList,readPunchList,PunchError} from '../src/server/punch-list.ts';
function setup(){const f=fixture();f.db.exec("INSERT INTO owner_accounts(id,email_normalized,status,created_at) VALUES ('a','a@example.com','active',1),('b','b@example.com','active',1),('removed','removed@example.com','removed',1)");return f;}
const item=(label='Repair latch')=>({action:'create',id:crypto.randomUUID(),label});
const change=(action,id,revision)=>({action,id,revision});
test('any active owner edits, completes and reopens without claiming; completion retains actor',async()=>{
 const {db,env}=setup();try{
 const i=item();await changePunchList(env,'a',i);await changePunchList(env,'a',i);assert.equal((await readPunchList(env,'b',new URLSearchParams())).items.length,1);
 await changePunchList(env,'b',{...change('edit',i.id,1),label:'Fix gate latch'});
 await changePunchList(env,'b',change('complete',i.id,2));
 assert.equal((await readPunchList(env,'a',new URLSearchParams())).items.length,0);
 const saved=(await readPunchList(env,'a',new URLSearchParams({includeCompleted:'true'}))).items[0];assert.equal(saved.completed_email,'b@example.com');assert.equal(saved.creator_email,'a@example.com');assert.ok(saved.completed_at);
 await changePunchList(env,'a',{...change('edit',i.id,3),label:'Gate latch fixed'});
 await changePunchList(env,'a',change('reopen',i.id,4));const open=db.prepare('SELECT * FROM punch_tasks').get();assert.equal(open.completed_at,null);assert.equal(open.completed_by,null);assert.equal(open.created_at,saved.created_at);
 }finally{db.close();}
});
test('stale edits and competing completions are rejected without overwriting',async()=>{
 const {db,env}=setup();try{
 const i=item();await changePunchList(env,'a',i);
 const results=await Promise.allSettled(['a','b'].map(o=>changePunchList(env,o,change('complete',i.id,1))));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(changePunchList(env,'a',{...change('edit',i.id,1),label:'Stale name'}),PunchError);assert.equal(db.prepare('SELECT label FROM punch_tasks').get().label,i.label);
 }finally{db.close();}
});
test('global heading sorting precedes pagination; completed switch includes both states',async()=>{
 const {db,env}=setup();try{
 for(let n=0;n<55;n++){const i=item('Job '+String(n).padStart(2,'0'));await changePunchList(env,'a',i);db.prepare('UPDATE punch_tasks SET created_at=? WHERE id=?').run(1000+n,i.id);}
 const read=p=>readPunchList(env,'a',new URLSearchParams(p));
 const first=await read({sort:'name',direction:'asc'});assert.equal(first.openCount,55);assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.equal(first.items[0].label,'Job 00');
 const next=await read({sort:'name',direction:'asc',offset:'50'});assert.equal(next.openCount,55);assert.equal(next.items.length,5);assert.equal(next.items[0].label,'Job 50');
 assert.equal((await read({sort:'name',direction:'desc'})).items[0].label,'Job 54');
 assert.equal((await read({sort:'created',direction:'asc'})).items[0].label,'Job 00');
 await changePunchList(env,'b',change('complete',first.items[0].id,1));
 const completed=await read({includeCompleted:'true',sort:'completed',direction:'desc'});assert.equal(completed.openCount,54);assert.equal(completed.items[0].label,'Job 00');
 assert.equal((await read({includeCompleted:'true',sort:'status',direction:'desc'})).items[0].label,'Job 00');
 assert.ok((await read({})).items.every(i=>i.completed_at===null));
 for(const p of [{sort:'label; DROP TABLE punch_tasks'},{direction:'bad'},{offset:'-1'},{includeCompleted:'yes'}])await assert.rejects(read(p),PunchError);
 }finally{db.close();}
});
test('removed owners and retired actions are rejected; names are bounded plain text',async()=>{
 const {db,env}=setup();try{
 for(const label of [' ','x'.repeat(121)])await assert.rejects(changePunchList(env,'a',item(label)),PunchError);
 await assert.rejects(changePunchList(env,'removed',item()),PunchError);await assert.rejects(readPunchList(env,'removed',new URLSearchParams()),PunchError);
 const i=item('<b>Plain name</b>');await changePunchList(env,'a',i);
 for(const action of ['claim','release','category-create','category-update'])await assert.rejects(changePunchList(env,'a',change(action,i.id,1)),PunchError);
 assert.equal((await readPunchList(env,'a',new URLSearchParams())).items[0].label,i.label);assert.equal(db.prepare('SELECT count(*) n FROM local_test_mail').get().n,0);
 }finally{db.close();}
});
test('migration preserves existing names, creation and completion, retaining retired fields in legacy snapshot',()=>{
 const db=new DatabaseSync(':memory:');try{
 db.exec('PRAGMA foreign_keys=ON');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')&&!f.startsWith('0012')).sort())db.exec(readFileSync('migrations/'+f,'utf8'));
 db.exec("INSERT INTO owner_accounts(id,email_normalized,status,created_at) VALUES ('a','a@example.com','active',1); INSERT INTO punch_items VALUES ('one','Existing','Old description','general','a','a',100,200,NULL,3),('two','Finished','History','general','a','a',100,300,300,4)");
 db.exec(readFileSync('migrations/0012_simple_punch_list.sql','utf8'));
 const open=db.prepare("SELECT * FROM punch_tasks WHERE id='one'").get(),done=db.prepare("SELECT * FROM punch_tasks WHERE id='two'").get();assert.equal(open.label,'Existing');assert.equal(open.created_at,100);assert.equal(open.completed_by,null);assert.equal(done.completed_by,'a');assert.equal(done.completed_at,300);assert.equal(done.revision,4);assert.equal(db.prepare("SELECT description FROM punch_items WHERE id='one'").get().description,'Old description');
 }finally{db.close();}
});
