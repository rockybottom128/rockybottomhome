import { hashPassword } from 'better-auth/crypto';
import { token } from './crypto';
import { ownerAuth } from './owner-auth';
import type { AppEnv } from './env';
export async function inviteOwner(env:AppEnv,email:string,actor:string,bootstrap=false) {
  const existing=await env.DB.prepare('SELECT id,auth_subject,status FROM owner_accounts WHERE email_normalized=?').bind(email).first<{id:string;auth_subject:string;status:string}>();
  if(existing && (existing.status!=='removed'||bootstrap))throw new Error('Owner account already exists');
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
  await ownerAuth(env).api.requestPasswordReset({body:{email,redirectTo:env.APP_ORIGIN+'/owner/reset'}});
}
