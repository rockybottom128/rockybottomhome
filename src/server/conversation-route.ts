import type {APIRoute} from 'astro';
import {runtime} from './runtime';
import {configured,body,json} from './env';
import {getOwner} from './owner-auth';
import {getVisitor} from './visitor-auth';
import {visitorDemoEnabled} from './settings';
import {limit,RateLimitError} from './rate-limit';
import {conversationInbox,conversationHistory,changeConversation,ConversationConflict} from './conversations';
export function conversationRoute(role:'owner'|'visitor'):APIRoute{return async({request,url})=>{
 const env=runtime();if(!configured(env,request))return json({error:'Messaging unavailable.'},503);
 try{
  const input=request.method==='POST'?await body(request,env,16384):null;
  if(role==='visitor'&&!await visitorDemoEnabled(env))return json({error:'Visitor access is currently paused.'},403);
  const user=role==='owner'?await getOwner(env,request):await getVisitor(env,request);
  if(!user)return json({error:role==='owner'?'Active owner sign-in required.':'Verify your email to read messages.'},401);
  const actor={role,id:user.id};
  if(input){await limit(env,`conversation:${role}:${user.id}`,30,60000);return json(await changeConversation(env,actor,input));}
  const thread=url.searchParams.get('thread');
  if(thread&&thread.length>64)return json({error:'Invalid conversation.'},400);
  return json(thread?await conversationHistory(env,actor,thread):await conversationInbox(env,actor));
 }catch(error){
  if(error instanceof RateLimitError)return json({error:'Too many message actions. Please wait a minute.'},429);
  if(error instanceof ConversationConflict)return json({error:error.message},409);
  if(error instanceof SyntaxError||error instanceof Error&&/^(Invalid |Request too large)/.test(error.message))return json({error:error instanceof SyntaxError?'Invalid request.':error.message},400);
  return json({error:'Unable to confirm this action. Refresh messages before retrying. Your draft has been kept.'},503);
 }
};}
