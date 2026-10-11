import type {APIRoute} from 'astro';
import {runtime} from '../../../server/runtime';
import {configured,body,json} from '../../../server/env';
import {getOwner} from '../../../server/owner-auth';
import {changeBooking,BookingConflict} from '../../../server/bookings';
export const prerender=false;
export const POST:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Booking service unavailable.'},503);
 try{
  const input=await body(request,env),owner=await getOwner(env,request);
  if(!owner)return json({error:'Active owner sign-in required.'},401);
  return json(await changeBooking(env,{ownerId:owner.id},input));
 }catch(error){
  if(error instanceof BookingConflict)return json({error:error.message},409);
  if(error instanceof Error&&/^(Invalid |Enter |Acknowledge |Request too large)/.test(error.message))return json({error:error.message},400);
  return json({error:'Unable to confirm this action. Reload before retrying.'},503);
 }
};
