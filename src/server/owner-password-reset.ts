import type {AppEnv} from './env';
import {limit,RateLimitError} from './rate-limit';

/** Run the complete account-dependent operation under waitUntil, after the
 * generic response. Never surface account existence or provider failures. */
export async function processOwnerPasswordReset(env:AppEnv,email:string,send:()=>Promise<unknown>) {
 try {
  // Apply to every normalized address, including unknown/removed accounts.
  // Repeated clicks do not create fresh reset tokens or send additional email.
  await limit(env,'owner-reset-request:'+email,1,60000);
  const owner=await env.DB.prepare("SELECT id FROM owner_accounts WHERE email_normalized=? AND status IN ('active','invited')").bind(email).first();
  if(!owner)return;
  await send();
 }catch(error){
  if(!(error instanceof RateLimitError))console.warn('Owner password reset could not be completed.');
 }
}
