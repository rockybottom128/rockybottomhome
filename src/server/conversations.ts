import type {AppEnv} from './env';
export type MessageActor={role:'owner'|'visitor';id:string};
export class ConversationConflict extends Error {}
export type ConversationThread={id:string;visitor_id:string;booking_id:string|null;subject:string;status:string;revision:number;created_at:number;updated_at:number};
const ownerGuard="EXISTS(SELECT 1 FROM owner_accounts WHERE id=? AND status='active')";
const visitorGuard='EXISTS(SELECT 1 FROM visitors WHERE id=? AND email_verified_at IS NOT NULL)';
const gracePeriod=30*86400000;
const eligible="EXISTS(SELECT 1 FROM bookings WHERE visitor_id=v.id AND status IN ('requested','approved') AND ends_at>?)";
// Deliberately exclude creator identity and retry keys from both public response shapes.
const threadColumns='id,visitor_id,booking_id,subject,status,revision,created_at,updated_at';
function actorGuard(actor:MessageActor){return actor.role==='owner'?ownerGuard:visitorGuard;}
async function authorize(env:AppEnv,actor:MessageActor){
 const ok=await env.DB.prepare(`SELECT 1 WHERE ${actorGuard(actor)}`).bind(actor.id).first();
 if(!ok)throw new ConversationConflict('Your access changed. Sign in again.');
}
function string(value:unknown,max:number,label:string){
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(`Invalid ${label}.`);
 return value.trim();
}
export async function conversationCount(env:AppEnv){
 return (await env.DB.prepare("SELECT COUNT(*) n FROM conversation_threads WHERE status='needs_owner'").first<{n:number}>())?.n??0;
}
function cursor(raw:string|null,type:'thread'|'visitor'){
 if(raw===null)return null;
 try{
  if(raw.length>512)throw Error();
  const value=JSON.parse(raw);
  if(!Array.isArray(value)||value.length!==2||typeof value[1]!=='string'||!value[1]||value[1].length>64)throw Error();
  if(type==='thread'?(!Number.isSafeInteger(value[0])||value[0]<0):(typeof value[0]!=='string'||!value[0]||value[0].length>254))throw Error();
  return value as [string|number,string];
 }catch{throw Error('Invalid message page. Refresh messages.');}
}
export async function conversationInbox(env:AppEnv,actor:MessageActor,params=new URLSearchParams(),now=Date.now()){
 await authorize(env,actor);
 const after=cursor(params.get('after'),'thread'),visitorAfter=cursor(params.get('visitors_after'),'visitor');
 const clauses=actor.role==='visitor'?['t.visitor_id=?']:[];
 const args:(string|number)[]=actor.role==='visitor'?[actor.id]:[];
 if(after){clauses.push('(t.updated_at<? OR (t.updated_at=? AND t.id>?))');args.push(after[0],after[0],after[1]);}
 const rows=(await env.DB.prepare(`SELECT ${threadColumns.split(',').map(column=>'t.'+column).join(',')},v.email_normalized,
 (SELECT body FROM conversation_entries e WHERE e.thread_id=t.id AND e.kind='message' ORDER BY thread_revision DESC LIMIT 1) preview
 FROM conversation_threads t JOIN visitors v ON v.id=t.visitor_id ${clauses.length?'WHERE '+clauses.join(' AND '):''}
 ORDER BY t.updated_at DESC,t.id LIMIT 201`).bind(...args).all<ConversationThread&{email_normalized:string;preview:string}>()).results;
 const visitorArgs:(string|number)[]=[now-gracePeriod,...(actor.role==='visitor'?[actor.id]:[])];
 if(visitorAfter)visitorArgs.push(visitorAfter[0],visitorAfter[0],visitorAfter[1]);
 const people=(await env.DB.prepare(`SELECT v.id,v.email_normalized FROM visitors v WHERE v.email_verified_at IS NOT NULL AND ${eligible} ${actor.role==='visitor'?'AND v.id=?':''}
 ${visitorAfter?'AND (v.email_normalized>? OR (v.email_normalized=? AND v.id>?))':''}
 ORDER BY v.email_normalized,v.id LIMIT 101`).bind(...visitorArgs).all<{id:string;email_normalized:string}>()).results;
 const threads=rows.slice(0,200),visitors=people.slice(0,100),last=threads.at(-1),lastVisitor=visitors.at(-1);
 const attention=actor.role==='owner'?await conversationCount(env):(await env.DB.prepare("SELECT COUNT(*) n FROM conversation_threads WHERE visitor_id=? AND status='needs_owner'").bind(actor.id).first<{n:number}>())?.n??0;
 return {threads,visitors,attention,next:rows.length>200?JSON.stringify([last!.updated_at,last!.id]):null,visitorsNext:people.length>100?JSON.stringify([lastVisitor!.email_normalized,lastVisitor!.id]):null};
}
export async function conversationHistory(env:AppEnv,actor:MessageActor,id:string,before:string|null=null){
 await authorize(env,actor);
 if(before!==null&&(!/^[1-9][0-9]{0,15}$/.test(before)||!Number.isSafeInteger(Number(before))))throw Error('Invalid message history page.');
 const thread=await env.DB.prepare(`SELECT ${threadColumns} FROM conversation_threads WHERE id=? ${actor.role==='visitor'?'AND visitor_id=?':''}`).bind(...(actor.role==='visitor'?[id,actor.id]:[id])).first<ConversationThread>();
 if(!thread)throw new ConversationConflict('Conversation unavailable. Refresh your messages.');
 const rows=(await env.DB.prepare(`SELECT id,actor_role,actor_label,kind,body,created_at,thread_revision FROM conversation_entries WHERE thread_id=? ${before===null?'':'AND thread_revision<?'} ORDER BY thread_revision DESC LIMIT 101`).bind(id,...(before===null?[]:[Number(before)])).all<{id:string;actor_role:string;actor_label:string;kind:string;body:string;created_at:number;thread_revision:number}>()).results;
 const entries=rows.slice(0,100).reverse();
 return {thread,entries:actor.role==='owner'?entries:entries.map(e=>({...e,actor_label:e.actor_role==='owner'?'Owner':e.actor_label})),before:rows.length>100?String(entries[0].thread_revision):null};
}
export async function changeConversation(env:AppEnv,actor:MessageActor,input:Record<string,unknown>,now=Date.now()){
 await authorize(env,actor);
 const action=input.action;
 if(!['create','reply','resolved','external'].includes(String(action)))throw Error('Invalid conversation action.');
 if(actor.role==='visitor'&&action!=='create'&&action!=='reply')throw Error('Invalid conversation action.');
 const key=string(input.request_key,36,'retry key');if(!/^[a-f0-9-]{36}$/.test(key))throw Error('Invalid retry key.');
 const text=action==='create'||action==='reply'?string(input.body,2000,'message (1–2000 characters)'):'';
 const subject=action==='create'?string(input.subject,120,'subject'):'';
 const visitorId=action==='create'?(actor.role==='visitor'?actor.id:string(input.visitor_id,64,'visitor')):'';
 const bookingId=action==='create'&&input.booking_id?string(input.booking_id,64,'booking'):null;
 const threadId=action==='create'?'':string(input.thread_id,64,'conversation');
 const revision=action==='create'?0:input.revision;
 if(!Number.isInteger(revision)||Number(revision)<0)throw Error('Invalid conversation revision.');
 const signature=JSON.stringify([action,text,subject,visitorId,bookingId,threadId,revision]);
 const replay=async()=>{
  const row=await env.DB.prepare('SELECT thread_id,request_signature FROM conversation_entries WHERE actor_role=? AND actor_id=? AND request_key=?').bind(actor.role,actor.id,key).first<{thread_id:string;request_signature:string}>();
  if(row&&row.request_signature!==signature)throw new ConversationConflict('This send was already used for different content. Refresh before sending again.');
  return row?{id:row.thread_id}:null;
 };
 const previous=await replay();if(previous)return previous;
 const id=crypto.randomUUID(),entryId=crypto.randomUUID();
 // All permissions and revision conditions are repeated inside the atomic batch.
 // An entry is inserted only against the viewed revision; its unique ID gates all later updates.
 const label=actor.role==='owner'?"(SELECT email_normalized FROM owner_accounts WHERE id=?)":"(SELECT email_normalized FROM visitors WHERE id=?)";
 const nextStatus=action==='resolved'?'resolved':action==='external'?'external':actor.role==='visitor'?'needs_owner':'waiting_visitor';
 const kind=action==='create'||action==='reply'?'message':String(action);
 if(action==='create'){
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO conversation_threads(id,visitor_id,booking_id,subject,status,created_at,updated_at,creator_role,creator_id,request_key)
    SELECT ?,v.id,?,?,?,?,?,?,?,? FROM visitors v WHERE v.id=? AND v.email_verified_at IS NOT NULL AND ${eligible}
    AND ${actorGuard(actor)} AND (? IS NULL OR EXISTS(SELECT 1 FROM bookings WHERE id=? AND visitor_id=v.id))
    ON CONFLICT(creator_role,creator_id,request_key) DO NOTHING`).bind(id,bookingId,subject,nextStatus,now,now,actor.role,actor.id,key,visitorId,now-gracePeriod,actor.id,bookingId,bookingId),
   env.DB.prepare(`INSERT INTO conversation_entries(id,thread_id,actor_role,actor_id,actor_label,kind,body,created_at,thread_revision,request_key,request_signature)
    SELECT ?,id,?,?,${label},'message',?,?,1,?,? FROM conversation_threads WHERE id=?`).bind(entryId,actor.role,actor.id,actor.id,text,now,key,signature,id),
  ]);
 }else{
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO conversation_entries(id,thread_id,actor_role,actor_id,actor_label,kind,body,created_at,thread_revision,request_key,request_signature)
    SELECT ?,t.id,?,?,${label},?,?,?,?,?,? FROM conversation_threads t WHERE t.id=? AND t.revision=?
    AND ${actorGuard(actor)} ${actor.role==='visitor'?'AND t.visitor_id=?':''}
    ${kind==='message'?'':"AND t.status NOT IN ('resolved','external')"}
    ON CONFLICT(actor_role,actor_id,request_key) DO NOTHING`).bind(entryId,actor.role,actor.id,actor.id,kind,text,now,Number(revision)+1,key,signature,threadId,revision,actor.id,...(actor.role==='visitor'?[actor.id]:[])),
   env.DB.prepare(`UPDATE conversation_threads SET status=?,revision=revision+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM conversation_entries WHERE id=?)`).bind(nextStatus,now,threadId,entryId),
  ]);
 }
 const saved=await replay();if(saved)return saved;
 throw new ConversationConflict(action==='create'?'New conversations require a verified visitor with a requested or approved viewing that ends in the future or ended less than 30 days ago. Existing conversations remain available.':'This conversation changed. Refresh its history before replying or resolving it. Your draft has been kept.');
}
