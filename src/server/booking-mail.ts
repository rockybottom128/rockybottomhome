import type {AppEnv} from './env';
export type BookingEmail={id:string;booking_id:string;booking_revision:number;kind:string;status:string;payload_json:string;created_at:number;attempted_at:number|null;sent_at:number|null;provider_message_id:string|null};
export class MessageConflict extends Error {}
export function bookingEmailText(status:string,start:number,end:number,reason:string,origin:string){
 const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'});
 const time=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeStyle:'short'});
 return `Your Rocky Bottom viewing is ${status}.\n\n${date.format(start)}–${time.format(end)} Eastern Time.\n${reason?`\nCancellation reason: ${reason}\n`:''}\n${status==='canceled'?'You may choose another available time when visitor booking is enabled.':'Identity and agent validation are simulated. No entry or access code is provided.'}\n\nView current status after email verification: ${origin}/viewings/status/`;
}
export async function queueOwnerMessage(env:AppEnv,ownerId:string,input:Record<string,unknown>){
 const {id,revision,request_key}=input,message=typeof input.message==='string'?input.message.trim():'';
 if(typeof id!=='string'||id.length>64||!Number.isSafeInteger(revision)||Number(revision)<1||typeof request_key!=='string'||!/^[a-f0-9-]{36}$/.test(request_key)||message.length<5||message.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message))throw Error('Enter a message (5–2000 characters).');
 const dedup=`message:${ownerId}:${request_key}`,mailId=crypto.randomUUID(),now=Date.now();
 const previous=await env.DB.prepare('SELECT id,booking_id,payload_json FROM email_outbox WHERE deduplication_key=?').bind(dedup).first<{id:string;booking_id:string;payload_json:string}>();
 if(previous){if(previous.booking_id!==id||JSON.parse(previous.payload_json).message!==message)throw new MessageConflict('This message changed after submission. Reload before sending another.');return previous.id;}
 const b=await env.DB.prepare('SELECT starts_at,ends_at FROM bookings WHERE id=?').bind(id).first<{starts_at:number;ends_at:number}>();
 if(!b)throw new MessageConflict('This request is no longer available.');
 const date=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'full',timeStyle:'short'}).format(b.starts_at);
 const payload=JSON.stringify({subject:'Message about your Rocky Bottom viewing',message,text:`An owner sent a message about your viewing on ${date} Eastern Time.\n\n${message}\n\nView current status after email verification: ${env.APP_ORIGIN}/viewings/status/\nNo entry or access code is provided.`});
 const result=await env.DB.batch([
  env.DB.prepare(`INSERT INTO email_outbox(id,booking_id,booking_revision,kind,deduplication_key,due_at,status,payload_json,created_at,actor_id)
   SELECT ?,id,revision,'followup',?,?,'pending',?,?,? FROM bookings WHERE id=? AND revision=? AND status IN ('requested','approved') AND starts_at>?
   AND EXISTS(SELECT 1 FROM owner_accounts WHERE id=? AND status='active') AND NOT EXISTS(SELECT 1 FROM email_outbox WHERE deduplication_key=?)`).bind(mailId,dedup,now,payload,now,ownerId,id,revision,now,ownerId,dedup),
  env.DB.prepare(`INSERT INTO audit_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,'booking_message_queued',?,? WHERE EXISTS(SELECT 1 FROM email_outbox WHERE id=?)`).bind(crypto.randomUUID(),ownerId,id,now,mailId),
 ]);
 if(result[0].meta.changes!==1){
  const replay=await env.DB.prepare('SELECT id,booking_id,payload_json FROM email_outbox WHERE deduplication_key=?').bind(dedup).first<{id:string;booking_id:string;payload_json:string}>();
  if(replay&&replay.booking_id===id&&JSON.parse(replay.payload_json).message===message)return replay.id;
  throw new MessageConflict('The request changed or is no longer upcoming. Reload before sending.');
 }
 return mailId;
}
type Sender=(to:string,subject:string,text:string,key:string)=>Promise<string>;
/** Claim before sending. Never retry an attempted send whose acceptance is unknown. */
export async function deliverBookingEmail(env:AppEnv,id:string,send:Sender){
 const claimed=await env.DB.prepare(`UPDATE email_outbox SET status='sending',attempted_at=? WHERE id=? AND status IN ('pending','failed') AND payload_json IS NOT NULL AND created_at IS NOT NULL
  AND EXISTS(SELECT 1 FROM bookings b WHERE b.id=email_outbox.booking_id AND b.revision=email_outbox.booking_revision
   AND ((email_outbox.kind='confirmation' AND (b.status='canceled' OR (b.status='approved' AND b.starts_at>?)))
    OR (email_outbox.kind='followup' AND b.status IN ('requested','approved') AND b.starts_at>?)))
  RETURNING *`).bind(Date.now(),id,Date.now(),Date.now()).first<BookingEmail & {deduplication_key:string}>();
 if(!claimed)return (await env.DB.prepare('SELECT status FROM email_outbox WHERE id=?').bind(id).first<{status:string}>())?.status??'unavailable';
 let receipt:string;
 try{
  const visitor=await env.DB.prepare('SELECT v.email_normalized FROM visitors v JOIN bookings b ON b.visitor_id=v.id WHERE b.id=? AND v.email_verified_at IS NOT NULL').bind(claimed.booking_id).first<{email_normalized:string}>();
  if(!visitor)throw Error('Verified recipient unavailable');
  const payload=JSON.parse(claimed.payload_json) as {subject:string;text:string};
  receipt=await send(visitor.email_normalized,payload.subject,payload.text,claimed.deduplication_key);
 }catch(error){
  const status=error&&typeof error==='object'&&'uncertain' in error?'uncertain':'failed';
  await env.DB.prepare("UPDATE email_outbox SET status=? WHERE id=? AND status='sending'").bind(status,id).run();
  return status;
 }
 // A database failure after provider acceptance leaves 'sending', never a retryable failure.
 await env.DB.prepare("UPDATE email_outbox SET status='sent',provider_message_id=?,sent_at=? WHERE id=? AND status='sending'").bind(receipt,Date.now(),id).run();
 return 'sent';
}
export async function bookingEmails(env:AppEnv,bookingIds:string[]){
 const emails:BookingEmail[]=[];
 for(let i=0;i<bookingIds.length;i+=90){
  const ids=bookingIds.slice(i,i+90);
  emails.push(...(await env.DB.prepare(`SELECT id,booking_id,booking_revision,kind,status,payload_json,created_at,attempted_at,sent_at,provider_message_id FROM email_outbox WHERE booking_id IN (${ids.map(()=>'?').join(',')}) AND created_at IS NOT NULL ORDER BY created_at DESC`).bind(...ids).all<BookingEmail>()).results);
 }
 return emails.sort((a,b)=>b.created_at-a.created_at);
}
