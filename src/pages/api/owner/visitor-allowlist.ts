import type {APIRoute} from 'astro';
import {runtime} from '../../../server/runtime';
import {configured,body,json} from '../../../server/env';
import {getOwner} from '../../../server/owner-auth';
import {readAllowlist,changeAllowlist,AllowlistConflict} from '../../../server/visitor-allowlist';
export const prerender=false;
const handle:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Allowlist service unavailable.'},503);
 try{
  const input=request.method==='POST'?await body(request,env):null;
  const owner=await getOwner(env,request);if(!owner)return json({error:'Active owner sign-in required.'},401);
  return json(input?await changeAllowlist(env,owner.id,input):await readAllowlist(env));
 }catch(error){
  if(error instanceof AllowlistConflict)return json({error:error.message},409);
  if(error instanceof Error&&/^(Enter |Invalid |That domain|Request too large)/.test(error.message))return json({error:error.message},400);
  return json({error:'Unable to confirm the change. Reload the list before trying again.'},503);
 }
};
export const GET=handle;
export const POST=handle;
