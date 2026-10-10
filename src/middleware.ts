import { defineMiddleware } from 'astro:middleware';
import { configured, noStore } from './server/env';
import { runtime } from './server/runtime';
import { getOwner } from './server/owner-auth';
export const onRequest=defineMiddleware(async(context,next)=>{
 const path=context.url.pathname.replace(/\/$/,'');
 if(path.startsWith('/owner') || path.startsWith('/api/') || path.startsWith('/viewings')) {
  // Owner UI is always server-rendered; unconfigured services fail closed.
  if(path.startsWith('/owner/') && path!=='/owner/reset') {
   const env=runtime();
   if(!configured(env,context.request)||!await getOwner(env,context.request)) {
    const response=context.redirect('/owner/',303);
    for(const [k,v] of Object.entries(noStore))response.headers.set(k,v);
    return response;
   }
  }
  const response=await next();
  for(const [k,v] of Object.entries(noStore))response.headers.set(k,v);
  return response;
 }
 return next();
});
