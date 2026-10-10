import type { APIRoute } from 'astro';
import { runtime } from '../../../server/runtime';
import { configured, body, json, normalizeEmail } from '../../../server/env';
import { getOwner } from '../../../server/owner-auth';
import { setVisitorDemo } from '../../../server/settings';
import { inviteOwner } from '../../../server/owners';
import { digest,equal } from '../../../server/crypto';
import { limit } from '../../../server/visitor-auth';
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
  if(params.action==='invite') {await inviteOwner(env,normalizeEmail(input.email),owner.id);return json({ok:true});}
  if(params.action==='remove' && typeof input.id==='string') {
   await env.DB.batch([
    env.DB.prepare("UPDATE owner_accounts SET status='removed' WHERE id=? AND status!='removed'").bind(input.id),
    env.DB.prepare('DELETE FROM auth_session WHERE user_id=(SELECT auth_subject FROM owner_accounts WHERE id=?)').bind(input.id),
    env.DB.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),owner.id,'owner_removed',input.id,Date.now()),
   ]);return json({ok:true});
  }
  return json({error:'Not found.'},404);
 }catch{return json({error:'Unable to complete this action. Active or pending accounts cannot be reinvited and the last active owner cannot be removed. If an invitation was saved but email failed, use the password setup link on sign-in.'},400);}
};
