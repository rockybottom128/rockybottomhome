import { defineMiddleware } from 'astro:middleware';
import { configured, noStore } from './server/env';
import { runtime,waitUntil } from './server/runtime';
import { getOwner } from './server/owner-auth';
import { secureResponse } from './server/security-headers';
import { maybeCleanupExpiredRecords } from './server/expired-records';
export const onRequest=defineMiddleware(async(context,next)=>{
 const path=context.url.pathname.replace(/\/$/,'');
 if(path.startsWith('/owner') || path.startsWith('/api/') || path.startsWith('/viewings')) {
  const env=runtime();
  if(configured(env,context.request))waitUntil(maybeCleanupExpiredRecords(env));
  // Owner UI is always server-rendered; unconfigured services fail closed.
  if(path.startsWith('/owner/') && path!=='/owner/reset') {
   if(!configured(env,context.request)||!await getOwner(env,context.request)) {
    const response=secureResponse(context.redirect('/owner/',303),context.url);
    for(const [k,v] of Object.entries(noStore))response.headers.set(k,v);
    return response;
   }
  }
  const response=secureResponse(await next(),context.url);
  for(const [k,v] of Object.entries(noStore))response.headers.set(k,v);
  return response;
 }
 return secureResponse(await next(),context.url);
});
