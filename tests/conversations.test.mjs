import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/d1.mjs';
import {changeConversation,conversationInbox,conversationHistory,conversationCount,ConversationConflict} from '../src/server/conversations.ts';
const owner={role:'owner',id:'o'},otherOwner={role:'owner',id:'o2'},visitor={role:'visitor',id:'v'},stranger={role:'visitor',id:'v2'};
function setup(){const f=fixture();f.db.exec(`INSERT INTO owner_accounts(id,email_normalized,status,created_at) VALUES ('o','one@example.com','active',1),('o2','two@example.com','active',1);
 INSERT INTO visitors(id,email_normalized,email_verified_at,created_at) VALUES ('v','v@example.com',1,1),('v2','v2@example.com',1,1),('unverified','u@example.com',NULL,1);
 INSERT INTO availability_slots VALUES ('s',100,200,'owner_coordinated',1);
 INSERT INTO bookings(id,visitor_id,slot_id,starts_at,ends_at,mode,source,status,created_at) VALUES ('b','v','s',100,200,'owner_coordinated','public','requested',1);`);return f;}
const create=()=>({action:'create',visitor_id:'v',subject:'Viewing question',body:'Can our agent join us?',request_key:crypto.randomUUID()});
const reply=(id,revision,body='Yes, that works.')=>({action:'reply',thread_id:id,revision,body,request_key:crypto.randomUUID()});
test('either side starts threads; visitor grouping and shared attention count threads, not messages',async()=>{
 const {db,env}=setup();try{
 const a=await changeConversation(env,visitor,create());assert.equal(await conversationCount(env),1);
 await changeConversation(env,visitor,reply(a.id,1,'Another detail'));assert.equal(await conversationCount(env),1);
 const history=await conversationHistory(env,owner,a.id);assert.equal(history.entries.length,2);assert.equal(await conversationCount(env),1);
 await changeConversation(env,otherOwner,reply(a.id,2));assert.equal(await conversationCount(env),0);
 assert.equal((await conversationHistory(env,owner,a.id)).entries[2].actor_label,'two@example.com');
 assert.equal((await conversationHistory(env,visitor,a.id)).entries[2].actor_label,'Owner');
 const b=await changeConversation(env,owner,create());assert.equal((await conversationHistory(env,visitor,b.id)).thread.status,'waiting_visitor');
 await changeConversation(env,visitor,reply(b.id,1));await changeConversation(env,visitor,reply(a.id,3));assert.equal(await conversationCount(env),2);
 assert.equal((await conversationInbox(env,owner)).threads.length,2);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);
 }finally{db.close();}
});
test('isolation, verification, eligibility, owner removal and booking ownership are enforced',async()=>{
 const {db,env}=setup();try{
 const a=await changeConversation(env,visitor,create());
 assert.equal((await conversationInbox(env,stranger)).threads.length,0);
 await assert.rejects(conversationHistory(env,stranger,a.id),ConversationConflict);
 await assert.rejects(changeConversation(env,stranger,reply(a.id,1)),ConversationConflict);
 await assert.rejects(changeConversation(env,stranger,create()),ConversationConflict);
 await assert.rejects(changeConversation(env,{role:'visitor',id:'unverified'},create()),ConversationConflict);
 await assert.rejects(changeConversation(env,owner,{...create(),booking_id:'not-their-booking'}),ConversationConflict);
 db.exec("UPDATE owner_accounts SET status='removed' WHERE id='o2'");
 await assert.rejects(changeConversation(env,otherOwner,reply(a.id,1)),ConversationConflict);
 await assert.rejects(changeConversation(env,visitor,{action:'resolved',thread_id:a.id,revision:1,request_key:crypto.randomUUID()}),/Invalid/);
 }finally{db.close();}
});
test('retries do not duplicate threads or replies; changed payloads and stale replies conflict',async()=>{
 const {db,env}=setup();try{
 const input=create();const [a,b]=await Promise.all([changeConversation(env,visitor,input),changeConversation(env,visitor,input)]);assert.equal(a.id,b.id);
 await assert.rejects(changeConversation(env,visitor,{...input,body:'Different message'}),ConversationConflict);
 const r=reply(a.id,1);await Promise.all([changeConversation(env,owner,r),changeConversation(env,owner,r)]);
 assert.equal((await conversationHistory(env,owner,a.id)).entries.length,2);
 const race=await Promise.allSettled([changeConversation(env,owner,reply(a.id,2)),changeConversation(env,otherOwner,reply(a.id,2))]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(changeConversation(env,owner,{action:'resolved',thread_id:a.id,revision:2,request_key:crypto.randomUUID()}),ConversationConflict);
 assert.equal((await conversationHistory(env,owner,a.id)).entries.length,3);
 }finally{db.close();}
});
test('resolution is logged, visitor replies reopen, and cancellation preserves existing conversations',async()=>{
 const {db,env}=setup();try{
 const a=await changeConversation(env,visitor,create());
 await changeConversation(env,owner,{action:'resolved',thread_id:a.id,revision:1,request_key:crypto.randomUUID()});assert.equal(await conversationCount(env),0);
 await changeConversation(env,visitor,reply(a.id,2));assert.equal(await conversationCount(env),1);
 db.exec("UPDATE bookings SET status='canceled'");
 assert.equal((await conversationInbox(env,visitor)).visitors.length,0);
 await assert.rejects(changeConversation(env,visitor,create()),ConversationConflict);
 await changeConversation(env,owner,{action:'external',thread_id:a.id,revision:3,request_key:crypto.randomUUID()});
 await changeConversation(env,visitor,reply(a.id,4,'One final question'));assert.equal(await conversationCount(env),1);
 assert.equal((await conversationHistory(env,visitor,a.id)).entries.length,5);
 }finally{db.close();}
});
test('invalid lengths reject without writing; text is preserved as plain text',async()=>{
 const {db,env}=setup();try{
 for(const data of [{body:' '},{body:'a'.repeat(2001)},{subject:'a'.repeat(121)},{request_key:'bad'}])await assert.rejects(changeConversation(env,visitor,{...create(),...data}),/Invalid/);
 const a=await changeConversation(env,visitor,{...create(),body:'<script>alert(1)</script>'});assert.equal((await conversationHistory(env,visitor,a.id)).entries[0].body,'<script>alert(1)</script>');
 }finally{db.close();}
});

test('closing is recorded only once until a new message reopens the thread',async()=>{
 const {db,env}=setup();try{
 const a=await changeConversation(env,visitor,create());
 const close=(action,revision)=>({action,thread_id:a.id,revision,request_key:crypto.randomUUID()});
 await changeConversation(env,owner,close('resolved',1));
 await assert.rejects(changeConversation(env,owner,close('resolved',2)),ConversationConflict);
 await assert.rejects(changeConversation(env,otherOwner,close('external',2)),ConversationConflict);
 let h=await conversationHistory(env,owner,a.id);assert.equal(h.entries.length,2);assert.equal(h.thread.revision,2);
 await changeConversation(env,visitor,reply(a.id,2));
 await changeConversation(env,owner,close('external',3));
 await assert.rejects(changeConversation(env,owner,close('external',4)),ConversationConflict);
 h=await conversationHistory(env,owner,a.id);assert.equal(h.entries.length,4);assert.equal(h.thread.status,'external');
 }finally{db.close();}
});
