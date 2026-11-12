import { hashPassword } from 'better-auth/crypto';
import { token } from './crypto';
import { sendOwnerInvitation } from './owner-auth';
import type { AppEnv } from './env';
import {RateLimitError} from './rate-limit';
export class OwnerConflictError extends Error {}
export class OwnerNotFoundError extends Error {}
export class OwnerInvitationDeliveryError extends Error {
  constructor(public retryAfter?:number){
    super('The owner invitation was saved, but email delivery could not be confirmed. Use Set or reset my password on sign-in; do not create another invitation.');
  }
}
export async function inviteOwner(env:AppEnv,email:string,actor:string,bootstrap=false) {
  const existing=await env.DB.prepare('SELECT id,auth_subject,status FROM owner_accounts WHERE email_normalized=?').bind(email).first<{id:string;auth_subject:string;status:string}>();
  if(existing && (existing.status!=='removed'||bootstrap))throw new OwnerConflictError('An active or pending owner account already exists. Use Set or reset my password on sign-in.');
  const id=existing?.auth_subject??crypto.randomUUID(),now=Date.now(),password=await hashPassword(token());
  const statements=existing ? [
    env.DB.prepare("UPDATE owner_accounts SET status='invited' WHERE id=? AND status='removed'").bind(existing.id),
    env.DB.prepare("UPDATE auth_account SET password=?,updated_at=? WHERE user_id=? AND provider_id='credential'").bind(password,now,id),
    env.DB.prepare('DELETE FROM auth_session WHERE user_id=?').bind(id),
    env.DB.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,'owner_reinvited',existing.id,now),
  ] : [
    env.DB.prepare('INSERT INTO auth_user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,0,?,?)').bind(id,'Owner',email,now,now),
    env.DB.prepare("INSERT INTO auth_account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES (?,?,'credential',?,?,?,?)").bind(crypto.randomUUID(),id,id,password,now,now),
    env.DB.prepare("INSERT INTO owner_accounts(id,email_normalized,auth_subject,status,created_at) VALUES (?,?,?,'invited',?)").bind(id,email,id,now),
    env.DB.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,'owner_invited',id,now),
  ];
  if(bootstrap) statements.unshift(env.DB.prepare("INSERT INTO setup_claims(id,created_at) VALUES ('initial-owner',?)").bind(now));
  await env.DB.batch(statements);
  // If delivery fails, the invitation remains. The owner can request another setup/reset link.
  try{await sendOwnerInvitation(env,email);}
  catch(error){throw new OwnerInvitationDeliveryError(error instanceof RateLimitError?error.retryAfter:undefined);}
}

export async function removeOwner(env:AppEnv,id:string,actor:string){
  let results;
  try{
    results=await env.DB.batch([
      env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,'owner_removed',id,? FROM owner_accounts WHERE id=? AND status!='removed'").bind(crypto.randomUUID(),actor,Date.now(),id),
      env.DB.prepare("UPDATE owner_accounts SET status='removed' WHERE id=? AND status!='removed'").bind(id),
      env.DB.prepare('DELETE FROM auth_session WHERE user_id=(SELECT auth_subject FROM owner_accounts WHERE id=?)').bind(id),
    ]);
  }catch(error){
    // D1 may wrap the database trigger error in a cause. Recognize only this
    // known conflict; never return raw database errors to the browser.
    let cause:unknown=error;
    for(let depth=0;depth<5&&cause instanceof Error;depth++,cause=cause.cause){
      if(cause.message.includes('Cannot remove the last active owner'))throw new OwnerConflictError('The last active owner cannot be removed. Activate another owner first.');
    }
    throw error;
  }
  if(results[1].meta.changes===0)throw new OwnerNotFoundError('Owner account was not found or has already been removed.');
}
