import type { APIRoute } from 'astro';
import { runtime } from '../../../server/runtime';
import { configured, json } from '../../../server/env';
import { getVisitor } from '../../../server/visitor-auth';
import { visitorDemoEnabled } from '../../../server/settings';
import { readCalendar } from '../../../server/availability';
import { availableSlots, visitorWindow } from '../../../lib/viewings/availability';
export const prerender=false;
export const GET:APIRoute=async({request,url})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Calendar service unavailable.'},503);
 try{
  if(!await visitorDemoEnabled(env))return json({error:'Visitor demonstrations are paused.'},403);
  if(!await getVisitor(env,request))return json({error:'Email verification required.'},401);
  let range;
  try{range=visitorWindow(url.searchParams.get('from'),url.searchParams.get('to'));}catch{return json({error:'Choose dates within the next 42 days.'},400);}
  const state=await readCalendar(env);
  return json({timeZone:'America/New_York',slots:availableSlots(state.periods,range.from,range.to)});
 }catch{return json({error:'Unable to load availability. Please retry.'},503);}
};
