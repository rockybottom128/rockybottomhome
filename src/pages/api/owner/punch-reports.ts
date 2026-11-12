import type {APIRoute} from 'astro';
import {runtime} from '../../../server/runtime';
import {configured,body,json} from '../../../server/env';
import {getOwner} from '../../../server/owner-auth';
import {PunchError,PunchValidationError} from '../../../server/punch-list';
import {prepareReport,deliverReport,reportHistory,reportDeliveryMode} from '../../../server/punch-reports';
import {sendMail} from '../../../server/mail';
import {limit,RateLimitError} from '../../../server/rate-limit';
import {requirePunchSetup,PunchSetupRequired} from '../../../server/punch-schema';
export const prerender=false;
export const GET:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Reports unavailable.'},503);
 const owner=await getOwner(env,request);if(!owner)return json({error:'Owner sign-in required.'},401);
 try{await requirePunchSetup(env,'reports');return json({history:await reportHistory(env,owner.id),deliveryMode:reportDeliveryMode(env)});}catch(e){return json({error:e instanceof PunchSetupRequired?e.message:'Report history unavailable.'},503);}
};
export const POST:APIRoute=async({request})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Reports unavailable.'},503);
 try{
  const input=await body(request,env,16384),owner=await getOwner(env,request);if(!owner)return json({error:'Owner sign-in required.'},401);
  await requirePunchSetup(env,'reports');
  await limit(env,'punch-report:'+owner.id,20,3600000);
  if(input.action==='prepare')return json(await prepareReport(env,owner.id,input));
  if(input.action==='send'&&input.deliveryMode!==reportDeliveryMode(env))return json({error:'Delivery mode changed or was not confirmed. Reload and review the current delivery mode before sending.'},409);
  if(input.action==='send')return json(await deliverReport(env,owner.id,input.id,(to,text,html,key)=>sendMail(env,to,'Rocky Bottom punch list',text,'report',key,html)));
  return json({error:'Invalid report action.'},400);
 }catch(e){if(e instanceof PunchSetupRequired)return json({error:e.message,code:'PUNCH_SETUP_REQUIRED'},503);if(e instanceof RateLimitError)return json({error:e.message},429);if(e instanceof PunchValidationError)return json({error:e.message},400);if(e instanceof PunchError)return json({error:e.message},409);if(e instanceof Error&&/^(Invalid |Request too large)/.test(e.message))return json({error:'Invalid request.'},400);return json({error:'Unable to confirm report action. Retry the same report or check history; do not create a duplicate.'},503);}
};
