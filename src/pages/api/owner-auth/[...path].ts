import type { APIRoute } from 'astro';
import { runtime } from '../../../server/runtime';
import { configured, json, normalizeEmail, noStore, readJson } from '../../../server/env';
import { limit } from '../../../server/visitor-auth';
import { ownerAuth } from '../../../server/owner-auth';
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
        const owner=await env.DB.prepare("SELECT id FROM owner_accounts WHERE email_normalized=? AND status IN ('active','invited')").bind(email).first();
        if(!owner) return path==='request-password-reset'?json({status:true,message:'If an owner account exists, instructions will be sent.'}):json({message:'Email or password is incorrect.'},401);
      }
    }
    const response=await ownerAuth(env).handler(request);
    const headers=new Headers(response.headers);for(const [k,v] of Object.entries(noStore))headers.set(k,v);
    return new Response(response.body,{status:response.status,headers});
  }catch{return json({message:'Unable to sign in. Please try again.'},400);}
};
