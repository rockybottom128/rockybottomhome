import type {APIRoute} from 'astro';
import {runtime} from '../../../server/runtime';
import {configured,body,json} from '../../../server/env';
import {getVisitor} from '../../../server/visitor-auth';
import {visitorDemoEnabled} from '../../../server/settings';
import {visitorBookings,requestBooking,changeBooking,BookingConflict} from '../../../server/bookings';
import {deliverBookingEmail} from '../../../server/booking-mail';
import {sendMail} from '../../../server/mail';
export const prerender=false;
const handle:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Booking service unavailable.'},503);
 try{
  const input=request.method==='POST'?await body(request,env):null;
  if(!await visitorDemoEnabled(env))return json({error:'Visitor booking is currently paused.'},403);
  const visitor=await getVisitor(env,request);if(!visitor)return json({error:'Email verification required.'},401);
  if(!input)return json({bookings:await visitorBookings(env,visitor.id)});
  if(input.action==='request')return json(await requestBooking(env,visitor.id,input));
  if(input.action==='cancel'){
   const result=await changeBooking(env,{visitorId:visitor.id},input);
   let emailStatus='unknown';
   try{emailStatus=await deliverBookingEmail(env,result.emailId,(to,subject,text,key)=>sendMail(env,to,subject,text,'visitor',key));}catch{}
   return json({id:result.id,status:result.status,emailStatus});
  }
  return json({error:'Invalid booking action.'},400);
 }catch(error){
  if(error instanceof BookingConflict)return json({error:error.message},409);
  if(error instanceof Error&&/^(Invalid |Enter |Choose |Save your |Confirm |Request too large)/.test(error.message))return json({error:error.message},400);
  return json({error:'Unable to confirm this action. Reload your requests before retrying.'},503);
 }
};
export const GET=handle;
export const POST=handle;
