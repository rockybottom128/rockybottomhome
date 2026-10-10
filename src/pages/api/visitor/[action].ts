import type { APIRoute } from 'astro';
import { runtime } from '../../../server/runtime';
import { configured, body, json, normalizeEmail } from '../../../server/env';
import { sendVisitorCode, verifyVisitorCode, visitorCookie, getVisitor } from '../../../server/visitor-auth';
import { RateLimitError } from '../../../server/rate-limit';
import { visitorDemoEnabled } from '../../../server/settings';
import { digest } from '../../../server/crypto';
export const prerender=false;
export const POST:APIRoute=async({request,params})=>{
  const env=runtime();
  if(!configured(env,request)) return json({error:'Email verification is not available yet.'},503);
  try {
    const input=await body(request,env),ip=request.headers.get('cf-connecting-ip')??'local';
    if(params.action!=='sign-out' && !await visitorDemoEnabled(env))return json({error:'Visitor demonstrations are currently paused. Please check back later.'},403);
    if(params.action==='demo-access')return await getVisitor(env,request)?json({ok:true}):json({error:'Email verification required.'},401);
    if(params.action==='send') {
      await sendVisitorCode(env,normalizeEmail(input.email),ip);
      return json({message:'Check your email for the latest eight-digit code.',retryAfter:60});
    }
    if(params.action==='verify') {
      const session=await verifyVisitorCode(env,normalizeEmail(input.email),String(input.code??''),ip);
      return session ? json({verified:true},200,{'Set-Cookie':visitorCookie(env,session)}) : json({error:'Invalid or expired code. Request a new code if needed.'},400);
    }
    if(params.action==='sign-out') {
      const cookie=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('rb-visitor='))?.slice(11);
      if(cookie) await env.DB.prepare('UPDATE visitor_sessions SET revoked_at=? WHERE token_digest=?').bind(Date.now(),await digest(cookie,env.OTP_SECRET)).run();
      return json({ok:true},200,{'Set-Cookie':visitorCookie(env,'',0)});
    }
    return json({error:'Not found.'},404);
  } catch(error) {
    if(error instanceof RateLimitError)return json({error:error.message,retryAfter:error.retryAfter},429,{'Retry-After':String(error.retryAfter)});
    const safe=error instanceof Error && /^(This email is not enabled|Enter a valid|Please wait|We could not send|Invalid request|Request too large)/.test(error.message);
    return json({error:safe?(error as Error).message:'Unable to complete verification. Please try again.'},400);
  }
};
