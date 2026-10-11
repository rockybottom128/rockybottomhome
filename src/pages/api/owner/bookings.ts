import type {APIRoute} from 'astro';
import {runtime} from '../../../server/runtime';
import {configured,body,json} from '../../../server/env';
import {getOwner} from '../../../server/owner-auth';
import {changeBooking,BookingConflict} from '../../../server/bookings';
import {deliverBookingEmail,queueOwnerMessage,MessageConflict} from '../../../server/booking-mail';
import {sendMail} from '../../../server/mail';
import {limit,RateLimitError} from '../../../server/rate-limit';
export const prerender=false;
export const POST:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Booking service unavailable.'},503);
 try{
  const input=await body(request,env),owner=await getOwner(env,request);
  if(!owner)return json({error:'Active owner sign-in required.'},401);
  let result:{id?:string;status?:string;emailId:string};
  if(input.action==='message'){
   await limit(env,'booking-message:'+owner.id,10,3600000);
   result={emailId:await queueOwnerMessage(env,owner.id,input)};
  }else if(input.action==='send-email'){
   if(typeof input.email_id!=='string'||input.email_id.length>64)return json({error:'Invalid email action.'},400);
   result={emailId:input.email_id};
  }else result=await changeBooking(env,{ownerId:owner.id},input);
  let emailStatus='unknown';
  try{emailStatus=await deliverBookingEmail(env,result.emailId,(to,subject,text,key)=>sendMail(env,to,subject,text,'visitor',key));}catch{/* Saved action remains authoritative; the dashboard shows recovery status. */}
  return json({...result,emailStatus});
 }catch(error){
  if(error instanceof RateLimitError)return json({error:error.message},429);
  if(error instanceof BookingConflict||error instanceof MessageConflict)return json({error:error.message},409);
  if(error instanceof Error&&/^(Invalid |Enter |Acknowledge |Request too large)/.test(error.message))return json({error:error.message},400);
  return json({error:'Unable to confirm this action. Reload before retrying.'},503);
 }
};
