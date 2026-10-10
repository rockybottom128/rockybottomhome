import type { APIRoute } from 'astro';
import { runtime } from '../../../server/runtime';
import { configured, body, json } from '../../../server/env';
import { getOwner } from '../../../server/owner-auth';
import { readCalendar, changeCalendar, CalendarConflict } from '../../../server/availability';
import { availableSlots, validDay } from '../../../lib/viewings/availability';
export const prerender=false;
export const GET:APIRoute=async({request,url})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Calendar service unavailable.'},503);
 if(!await getOwner(env,request))return json({error:'Active owner sign-in required.'},401);
 try{
  const state=await readCalendar(env),day=url.searchParams.get('day');
  if(day&&!validDay(day))return json({error:'Invalid date.'},400);
  return json({...state,slots:day?availableSlots(state.periods,day,day):[]});
 }catch{return json({error:'Unable to load availability.'},503);}
};
export const POST:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Calendar service unavailable.'},503);
 let input:Record<string,unknown>;
 try{input=await body(request,env);}catch{return json({error:'Invalid request.'},400);}
 const owner=await getOwner(env,request);if(!owner)return json({error:'Active owner sign-in required.'},401);
 try{return json(await changeCalendar(env,owner.id,input));}
 catch(error){
  if(error instanceof CalendarConflict)return json({error:error.message},409);
  if(error instanceof Error&&/^(Invalid|Choose|Use quarter)/.test(error.message))return json({error:error.message},400);
  return json({error:'Save could not be confirmed. Reload the calendar before retrying.'},503);
 }
};
