import type {AppEnv} from './env';
import {readCalendar,unreservedSlots} from './availability.ts';
import {readProfile} from './visitor-profile.ts';
import {visitorWindow} from '../lib/viewings/availability.ts';
export class BookingConflict extends Error {}
export type SavedBooking={id:string;visitor_id:string;starts_at:number;ends_at:number;mode:string;status:string;revision:number;agent_attending:number;validation_status:string;profile_snapshot:string|null;cancellation_reason:string;created_at:number;request_key:string|null};
const columns='id,visitor_id,starts_at,ends_at,mode,status,revision,agent_attending,validation_status,profile_snapshot,cancellation_reason,created_at,request_key';
export async function visitorBookings(env:AppEnv,visitorId:string){
 const rows=await env.DB.prepare(`SELECT ${columns} FROM bookings WHERE visitor_id=? ORDER BY starts_at DESC LIMIT 50`).bind(visitorId).all<SavedBooking>();
 return rows.results.map(({visitor_id,request_key,profile_snapshot,...booking})=>booking);
}
export async function ownerBookings(env:AppEnv){
 return (await env.DB.prepare(`SELECT b.*,v.email_normalized FROM bookings b JOIN visitors v ON v.id=b.visitor_id ORDER BY CASE WHEN b.status IN ('requested','approved') AND b.ends_at>? THEN 0 ELSE 1 END,b.starts_at DESC LIMIT 100`).bind(Date.now()).all<SavedBooking & {email_normalized:string}>()).results;
}
async function existingRequest(env:AppEnv,visitorId:string,key:string,day:string,time:string){
 const previous=await env.DB.prepare(`SELECT ${columns} FROM bookings WHERE visitor_id=? AND request_key=?`).bind(visitorId,key).first<SavedBooking>();
 if(!previous)return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(previous.starts_at),v=(k:string)=>parts.find(x=>x.type===k)!.value;
 if(`${v('year')}-${v('month')}-${v('day')}`!==day||`${v('hour')}:${v('minute')}`!==time)throw new BookingConflict('This retry key belongs to another selection. Reload your requests.');
 return {id:previous.id,status:previous.status};
}
export async function requestBooking(env:AppEnv,visitorId:string,input:Record<string,unknown>){
 const now=Date.now(),day=input.day,time=input.time,key=input.request_key;
 if(typeof key!=='string'||!/^[a-f0-9-]{36}$/.test(key)||typeof time!=='string'||!/^([01]\d|2[0-3]):00$/.test(time))throw Error('Invalid booking selection.');
 const range=visitorWindow(day,day,now);
 // Repeated submissions return the existing record, including when a racing
 // copy commits after the first lookup but before availability is calculated.
 const previous=await existingRequest(env,visitorId,key,range.from,time);
 if(previous)return previous;
 const profile=await readProfile(env,visitorId);
 if(!profile)throw Error('Save your visitor profile first.');
 if(profile.role==='agent'&&input.agent_attending!==true)throw Error('Confirm that you will attend the agent showing.');
 const state=await readCalendar(env),slot=unreservedSlots(state,range.from,range.to,now).find(s=>s.start===time);
 if(!slot){const replay=await existingRequest(env,visitorId,key,range.from,time);if(replay)return replay;throw new BookingConflict('That time is no longer available. Choose another time.');}
 const id=crypto.randomUUID(),slotId=crypto.randomUUID(),token=crypto.randomUUID(),mode=profile.role==='agent'?'agent_private':'owner_coordinated',source=input.source==='mls'?'mls':'public';
 const guard='EXISTS(SELECT 1 FROM calendar_state WHERE id=1 AND mutation_id=?)';
 const statements=[
  env.DB.prepare(`UPDATE calendar_state SET revision=revision+1,mutation_id=?,updated_by=NULL,updated_at=? WHERE id=1 AND revision=?
   AND EXISTS(SELECT 1 FROM site_settings WHERE key='visitor_demo' AND value='on')
   AND EXISTS(SELECT 1 FROM visitor_intake_profiles p JOIN visitors v ON v.id=p.visitor_id WHERE p.visitor_id=? AND p.revision=? AND v.email_verified_at IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM bookings WHERE visitor_id=? AND status IN ('requested','approved') AND ends_at>?)
   AND NOT EXISTS(SELECT 1 FROM bookings WHERE visitor_id=? AND request_key=?)`).bind(token,now,state.revision,visitorId,profile.revision,visitorId,now,visitorId,key),
  env.DB.prepare(`INSERT INTO availability_slots(id,starts_at,ends_at,mode,enabled) SELECT ?,?,?,?,1 WHERE ${guard}`).bind(slotId,slot.startsAt,slot.endsAt,mode,token),
  env.DB.prepare(`INSERT INTO bookings(id,visitor_id,slot_id,starts_at,ends_at,mode,source,referral_verified,agent_attending,status,revision,created_at,request_key,profile_snapshot,validation_status)
   SELECT ?,?,?,?,?,?,?,0,?,'requested',1,?,?,?,'simulated_pass' WHERE ${guard}`).bind(id,visitorId,slotId,slot.startsAt,slot.endsAt,mode,source,profile.role==='agent'?1:0,now,key,JSON.stringify(profile),token),
  env.DB.prepare(`INSERT INTO audit_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,'booking_requested',?,? WHERE ${guard}`).bind(crypto.randomUUID(),visitorId,id,now,token),
 ];
 try{
  const results=await env.DB.batch(statements);
  if(results[0].meta.changes!==1){
   const retry=await env.DB.prepare('SELECT id,status,starts_at FROM bookings WHERE visitor_id=? AND request_key=?').bind(visitorId,key).first<{id:string;status:string;starts_at:number}>();
   if(retry&&retry.starts_at===slot.startsAt)return {id:retry.id,status:retry.status};
   throw new BookingConflict('Availability or your profile changed, booking is paused, or you already have an upcoming request. Reload your requests before trying again.');
  }
 }catch(error){if(error instanceof BookingConflict)throw error;if(error instanceof Error&&/overlap|UNIQUE constraint/i.test(error.message))throw new BookingConflict('That time was just requested. Reload availability.');throw error;}
 return {id,status:'requested'};
}
export async function changeBooking(env:AppEnv,actor:{ownerId:string}|{visitorId:string},input:Record<string,unknown>){
 const {id,revision,action}=input;
 if(typeof id!=='string'||id.length>64||!Number.isSafeInteger(revision)||Number(revision)<1||!['approve','cancel'].includes(String(action)))throw Error('Invalid booking action.');
 const owner='ownerId' in actor;
 if(!owner&&action!=='cancel')throw Error('Invalid booking action.');
 if(action==='approve'&&input.acknowledge_simulation!==true)throw Error('Acknowledge that identity and agent validation are simulated.');
 const reason=action==='cancel'?(typeof input.reason==='string'?input.reason.trim():''):'';
 if(action==='cancel'&&(reason.length<5||reason.length>1000||/[\u0000-\u001f]/.test(reason)))throw Error('Enter a cancellation reason (5–1000 characters).');
 const now=Date.now(),state=await readCalendar(env),token=crypto.randomUUID(),actorId=owner?actor.ownerId:actor.visitorId;
 const auth=owner?"EXISTS(SELECT 1 FROM owner_accounts WHERE id=? AND status='active')":"EXISTS(SELECT 1 FROM site_settings WHERE key='visitor_demo' AND value='on') AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND visitor_id=?)";
 const status=action==='approve'?'approved':'canceled';
 const allowed=action==='approve'?"status='requested' AND starts_at>? AND validation_status='simulated_pass'":"status IN ('requested','approved') AND ends_at>?";
 const guard='EXISTS(SELECT 1 FROM calendar_state WHERE id=1 AND mutation_id=?)';
 const results=await env.DB.batch([
  env.DB.prepare(`UPDATE calendar_state SET revision=revision+1,mutation_id=?,updated_at=?,updated_by=? WHERE id=1 AND revision=? AND ${auth} AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND revision=? AND ${allowed})`).bind(token,now,owner?actorId:null,state.revision,...(owner?[actorId]:[id,actorId]),id,revision,now),
  env.DB.prepare(`UPDATE bookings SET status=?,revision=revision+1,cancellation_reason=? WHERE id=? AND ${guard}`).bind(status,reason,id,token),
  env.DB.prepare(`INSERT INTO audit_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),actorId,action==='approve'?'booking_approved':'booking_canceled',id,now,token),
 ]);
 if(results[0].meta.changes!==1)throw new BookingConflict('The request changed, access changed, or the visit has passed. Reload before trying again.');
 return {id,status};
}
