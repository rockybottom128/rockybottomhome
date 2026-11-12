import type { APIRoute } from 'astro';
import { runtime, waitUntil } from '../../../server/runtime';
import { configured, json, normalizeEmail, noStore, readJson } from '../../../server/env';
import { limit, RateLimitError } from '../../../server/rate-limit';
import { ownerAuth } from '../../../server/owner-auth';
import { processOwnerPasswordReset } from '../../../server/owner-password-reset';
export const prerender=false;
export const ALL:APIRoute=async({request,params})=>{
  const env=runtime();if(!configured(env,request)) return json({error:'Owner sign-in is not configured.'},503);
  const path=params.path??'';
  const allowed=request.method==='POST' && ['sign-in/email','sign-out','request-password-reset','reset-password'].includes(path);
  if(!allowed) return json({error:'Not found.'},404);
  if(request.method==='POST' && request.headers.get('origin')!==env.APP_ORIGIN) return json({error:'Invalid request.'},403);
  try {
    if(request.method==='POST') {
      if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Invalid request.'},400);
      await limit(env,'owner-auth-ip:'+(request.headers.get('cf-connecting-ip')??'local'),15,60000);
      const input=await readJson(request.clone());
      if(path==='request-password-reset') {
        const email=normalizeEmail(input.email);
        // Account lookup, throttling and delivery all happen off the response path.
        // The callback destination and mail purpose are never supplied by the caller.
        waitUntil(processOwnerPasswordReset(env,email,()=>ownerAuth(env).api.requestPasswordReset({body:{email,redirectTo:env.APP_ORIGIN+'/owner/reset'}})));
        return json({status:true,message:'If an owner account exists, instructions will be sent.'});
      }
    }
    const response=await ownerAuth(env).handler(request);
    const headers=new Headers(response.headers);for(const [k,v] of Object.entries(noStore))headers.set(k,v);
    return new Response(response.body,{status:response.status,headers});
  }catch(error){
    if(error instanceof RateLimitError)return json({message:'Too many requests. Please try again later.'},429,{'Retry-After':String(error.retryAfter)});
    return json({message:'Unable to sign in. Please try again.'},400);
  }
};
