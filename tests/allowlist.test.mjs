import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/d1.mjs';
import {readAllowlist,changeAllowlist,allowedVisitorEmail,validateAllowlistEntry,AllowlistConflict} from '../src/server/visitor-allowlist.ts';
test('one-time private import, exact matches, owner edits and removal never reseeded',async()=>{
 const {db,env}=fixture();try{
 Object.assign(env,{VISITOR_EMAIL_DOMAINS:'example.com',MAIL_ALLOWED_RECIPIENTS:'first@elsewhere.test',VISITOR_EMAIL_ADDRESSES:'SECOND@ELSEWHERE.TEST,first@elsewhere.test'});
 db.exec("INSERT INTO owner_accounts VALUES ('a','a@example.com',NULL,'active',0),('b','b@example.com',NULL,'active',0),('gone','gone@example.com',NULL,'removed',0)");
 await Promise.all([readAllowlist(env),readAllowlist(env)]);
 let list=await readAllowlist(env);assert.equal(list.entries.length,3);assert.equal(list.revision,1);
 assert.equal(await allowedVisitorEmail(env,'X@EXAMPLE.COM'),true);assert.equal(await allowedVisitorEmail(env,'x@sub.example.com'),false);assert.equal(await allowedVisitorEmail(env,'second+extra@elsewhere.test'),false);
 await assert.rejects(changeAllowlist(env,'gone',{action:'add',revision:1,kind:'domain',value:'other.test'}),AllowlistConflict);
 const p=list.entries.find(e=>e.kind==='domain');list=await changeAllowlist(env,'a',{action:'remove',revision:1,id:p.id});
 assert.equal(await allowedVisitorEmail(env,'x@example.com'),false);assert.equal((await readAllowlist({...env,VISITOR_EMAIL_DOMAINS:'new.test'})).entries.length,2);
 await assert.rejects(changeAllowlist(env,'b',{action:'add',revision:1,kind:'domain',value:'stale.test'}),AllowlistConflict);
 list=await changeAllowlist(env,'b',{action:'update',revision:list.revision,id:list.entries[0].id,kind:'email',value:'updated@elsewhere.test'});
 assert.equal(await allowedVisitorEmail(env,'updated@elsewhere.test'),true);
 for(const entry of [...list.entries])list=await changeAllowlist(env,'a',{action:'remove',revision:list.revision,id:entry.id});
 assert.equal((await readAllowlist(env)).entries.length,0);assert.equal(await allowedVisitorEmail(env,'first@elsewhere.test'),false);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM visitor_allowlist_audit').get().n,5);
 }finally{db.close();}
});
test('domain/email validation rejects wildcard, URL, malformed and duplicate entries',async()=>{
 for(const value of ['*.example.com','https://example.com','@example.com','example..com','-bad.com','example.c','example.a1com'])assert.throws(()=>validateAllowlistEntry('domain',value));
 assert.deepEqual(validateAllowlistEntry('domain',' Example.COM '),{kind:'domain',value:'example.com'});
 const {db,env}=fixture();try{db.exec("INSERT INTO owner_accounts VALUES ('a','a@example.com',NULL,'active',0)");let s=await readAllowlist(env);assert.equal(s.entries.length,0);s=await changeAllowlist(env,'a',{action:'add',revision:s.revision,kind:'email',value:'x@example.com'});await assert.rejects(changeAllowlist(env,'a',{action:'add',revision:s.revision,kind:'email',value:'X@example.com'}),/already listed/);}finally{db.close();}
});
test('competing owners commit one edit with one audit, and invalid import fails closed',async()=>{
 const {db,env}=fixture();try{
 env.VISITOR_EMAIL_DOMAINS='*.bad.test';await assert.rejects(readAllowlist(env));assert.equal(db.prepare('SELECT initialized FROM visitor_allowlist_state').get().initialized,0);
 env.VISITOR_EMAIL_DOMAINS='';db.exec("INSERT INTO owner_accounts VALUES ('a','a@example.com',NULL,'active',0),('b','b@example.com',NULL,'active',0)");
 const s=await readAllowlist(env);
 const result=await Promise.allSettled(['a','b'].map(id=>changeAllowlist(env,id,{action:'add',revision:s.revision,kind:'domain',value:id+'.test'})));
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal((await readAllowlist(env)).entries.length,1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM visitor_allowlist_audit').get().n,2);
 }finally{db.close();}
});
