import type {APIRoute} from 'astro';
import {runtime} from '../../../server/runtime';
import {configured,body,json} from '../../../server/env';
import {getOwner} from '../../../server/owner-auth';
import {limit,RateLimitError} from '../../../server/rate-limit';
import {readPunchList,changePunchList,PunchError} from '../../../server/punch-list';
export const prerender=false;
const route:APIRoute=async({request,url})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Punch list unavailable.'},503);
 try{
  const input=request.method==='POST'?await body(request,env,32768):null;
  const owner=await getOwner(env,request);if(!owner)return json({error:'Active owner sign-in required.'},401);
  if(input){await limit(env,`punch:${owner.id}`,60,60000);return json(await changePunchList(env,owner.id,input));}
  return json(await readPunchList(env,owner.id,url.searchParams));
 }catch(error){
  if(error instanceof RateLimitError)return json({error:'Too many changes. Please wait a minute.'},429);
  if(error instanceof PunchError)return json({error:error.message},409);
  if(error instanceof SyntaxError||error instanceof Error&&/^(Invalid |Request too large)/.test(error.message))return json({error:'Invalid request.'},400);
  return json({error:'Unable to confirm the change. Refresh the list before retrying.'},503);
 }
};
export const GET=route;export const POST=route;
