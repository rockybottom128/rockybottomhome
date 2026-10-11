import type {AppEnv} from './env';
export type MessageActor={role:'owner'|'visitor';id:string};
export class ConversationConflict extends Error {}
export type ConversationThread={id:string;visitor_id:string;booking_id:string|null;subject:string;status:string;revision:number;created_at:number;updated_at:number};
const ownerGuard="EXISTS(SELECT 1 FROM owner_accounts WHERE id=? AND status='active')";
const visitorGuard='EXISTS(SELECT 1 FROM visitors WHERE id=? AND email_verified_at IS NOT NULL)';
const eligible="EXISTS(SELECT 1 FROM bookings WHERE visitor_id=v.id AND status IN ('requested','approved'))";
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
export async function conversationInbox(env:AppEnv,actor:MessageActor){
 await authorize(env,actor);
 const where=actor.role==='visitor'?'WHERE t.visitor_id=?':'';
 const args=actor.role==='visitor'?[actor.id]:[];
 const threads=(await env.DB.prepare(`SELECT t.*,v.email_normalized,
 (SELECT body FROM conversation_entries e WHERE e.thread_id=t.id AND e.kind='message' ORDER BY thread_revision DESC LIMIT 1) preview
 FROM conversation_threads t JOIN visitors v ON v.id=t.visitor_id ${where}
 ORDER BY t.updated_at DESC,t.id`).bind(...args).all<ConversationThread&{email_normalized:string;preview:string}>()).results;
 const visitors=(await env.DB.prepare(`SELECT v.id,v.email_normalized FROM visitors v WHERE v.email_verified_at IS NOT NULL AND ${eligible} ${actor.role==='visitor'?'AND v.id=?':''} ORDER BY v.email_normalized`).bind(...args).all<{id:string;email_normalized:string}>()).results;
 return {threads,visitors};
}
export async function conversationHistory(env:AppEnv,actor:MessageActor,id:string){
 await authorize(env,actor);
 const thread=await env.DB.prepare(`SELECT * FROM conversation_threads WHERE id=? ${actor.role==='visitor'?'AND visitor_id=?':''}`).bind(...(actor.role==='visitor'?[id,actor.id]:[id])).first<ConversationThread>();
 if(!thread)throw new ConversationConflict('Conversation unavailable. Refresh your messages.');
 const entries=(await env.DB.prepare('SELECT id,actor_role,actor_label,kind,body,created_at,thread_revision FROM conversation_entries WHERE thread_id=? ORDER BY thread_revision').bind(id).all()).results;
 return {thread,entries:actor.role==='owner'?entries:entries.map(e=>({...e,actor_label:e.actor_role==='owner'?'Owner':e.actor_label}))};
}
export async function changeConversation(env:AppEnv,actor:MessageActor,input:Record<string,unknown>){
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
 const now=Date.now(),id=crypto.randomUUID(),entryId=crypto.randomUUID();
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
    ON CONFLICT(creator_role,creator_id,request_key) DO NOTHING`).bind(id,bookingId,subject,nextStatus,now,now,actor.role,actor.id,key,visitorId,actor.id,bookingId,bookingId),
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
 throw new ConversationConflict(action==='create'?'A verified visitor with a pending or approved request is required. Refresh your messages.':'This conversation changed. Refresh its history before replying or resolving it. Your draft has been kept.');
}
