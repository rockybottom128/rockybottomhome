import type { APIRoute } from 'astro';
import { runtime } from '../../../server/runtime';
import { configured, body, json, normalizeEmail } from '../../../server/env';
import { getOwner } from '../../../server/owner-auth';
import { setVisitorDemo } from '../../../server/settings';
import {inviteOwner,removeOwner,OwnerConflictError,OwnerNotFoundError,OwnerInvitationDeliveryError} from '../../../server/owners';
import { digest,equal } from '../../../server/crypto';
import {limit,RateLimitError} from '../../../server/rate-limit';
export const prerender=false;
export const POST:APIRoute=async({request,params})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Owner service is not configured.'},503);
 try {
  const input=await body(request,env);
  if(params.action==='bootstrap') {
   const supplied=request.headers.get('authorization')??'';
   if(!env.BOOTSTRAP_TOKEN||env.BOOTSTRAP_TOKEN.length<32||!env.BOOTSTRAP_OWNER_EMAIL||!equal(await digest(supplied,env.AUTH_SECRET),await digest('Bearer '+env.BOOTSTRAP_TOKEN,env.AUTH_SECRET)))return json({error:'Not authorized.'},403);
   const existing=await env.DB.prepare('SELECT id FROM owner_accounts LIMIT 1').first();if(existing)return json({error:'Initial owner is already configured.'},409);
   await inviteOwner(env,normalizeEmail(env.BOOTSTRAP_OWNER_EMAIL),'setup',true);return json({ok:true});
  }
  const owner=await getOwner(env,request);if(!owner)return json({error:'Owner sign-in required.'},401);
  if(params.action==='visitor-demo') {
   if(typeof input.enabled!=='boolean')return json({error:'Choose enabled or disabled.'},400);
   await setVisitorDemo(env,owner.id,input.enabled);return json({ok:true,enabled:input.enabled});
  }
  await limit(env,'owner-management:'+owner.id,10,3600000);
  if(params.action==='invite') {
   let email:string;try{email=normalizeEmail(input.email);}catch{return json({error:'Enter a valid email address.'},400);}
   await inviteOwner(env,email,owner.id);return json({ok:true});
  }
  if(params.action==='remove') {
   if(typeof input.id!=='string'||!input.id.trim()||input.id.length>64||/[\u0000-\u001f\u007f]/.test(input.id))return json({error:'Invalid owner identifier.'},400);
   await removeOwner(env,input.id,owner.id);return json({ok:true});
  }
  return json({error:'Not found.'},404);
 }catch(error){
  if(error instanceof OwnerInvitationDeliveryError)return json({error:error.message,invitationSaved:true},error.retryAfter?429:503,error.retryAfter?{'Retry-After':String(error.retryAfter)}:{});
  if(error instanceof RateLimitError)return json({error:'Too many owner-management requests. Please try again later.'},429,{'Retry-After':String(error.retryAfter)});
  if(error instanceof OwnerConflictError)return json({error:error.message},409);
  if(error instanceof OwnerNotFoundError)return json({error:error.message},404);
  if(error instanceof Error&&/^(Invalid |Request too large)/.test(error.message))return json({error:'Invalid request.'},400);
  return json({error:'Unable to confirm this action. Refresh to check the owner accounts before retrying.'},503);
 }
};
