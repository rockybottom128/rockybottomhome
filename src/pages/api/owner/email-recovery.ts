import type {APIRoute} from 'astro';
import {runtime} from '../../../server/runtime';
import {configured,body,json} from '../../../server/env';
import {getOwner} from '../../../server/owner-auth';
import {limit,RateLimitError} from '../../../server/rate-limit';
import {recoveryList,recoveryHistory,reviewEmail,RecoveryValidation,RecoveryConflict} from '../../../server/email-recovery';
export const prerender=false;
const route:APIRoute=async({request,url})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Email review unavailable.'},503);
 try{
  const input=request.method==='POST'?await body(request,env):null;
  const owner=await getOwner(env,request);if(!owner)return json({error:'Active owner sign-in required.'},401);
  if(input){await limit(env,'email-review:'+owner.id,30,60000);return json(await reviewEmail(env,owner.id,input));}
  if(url.searchParams.has('id'))return json({history:await recoveryHistory(env,owner.id,url.searchParams.get('kind'),url.searchParams.get('id'))});
  return json(await recoveryList(env,owner.id));
 }catch(e){
  if(e instanceof RateLimitError)return json({error:'Too many review actions. Please wait.'},429,{'Retry-After':String(e.retryAfter)});
  if(e instanceof RecoveryValidation)return json({error:e.message},400);
  if(e instanceof RecoveryConflict)return json({error:e.message},409);
  if(e instanceof Error&&/^(Invalid |Request too large)/.test(e.message))return json({error:'Invalid request.'},400);
  return json({error:'Unable to confirm the review. Refresh before retrying. Email recovery requires database migration 0015.'},503);
 }
};
export const GET=route;
export const POST=route;
