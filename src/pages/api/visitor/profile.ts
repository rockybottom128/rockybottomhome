import type { APIRoute } from 'astro';
import { runtime } from '../../../server/runtime';
import { configured,body,json } from '../../../server/env';
import { visitorDemoEnabled } from '../../../server/settings';
import { getVisitor } from '../../../server/visitor-auth';
import { readProfile,saveProfile,ProfileConflict } from '../../../server/visitor-profile';
export const prerender=false;
const handle:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Visitor service unavailable.'},503);
 try{
  const input=request.method==='POST'?await body(request,env):null;
  if(!await visitorDemoEnabled(env))return json({error:'Visitor demonstrations are paused.'},403);
  const visitor=await getVisitor(env,request);if(!visitor)return json({error:'Email verification required.'},401);
  return json({profile:input?await saveProfile(env,visitor.id,input):await readProfile(env,visitor.id)});
 }catch(error){
  if(error instanceof ProfileConflict)return json({error:error.message},409);
  if(error instanceof Error&&/^(Enter |Choose |Invalid |Request too large)/.test(error.message))return json({error:error.message},400);
  return json({error:'Unable to save or load your profile. Reload before retrying.'},503);
 }
};
export const GET=handle;
export const POST=handle;
