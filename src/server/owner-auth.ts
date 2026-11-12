import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './auth-schema';
import type { AppEnv } from './env';
import { sendMail } from './mail';
export function ownerAuth(env:AppEnv, resetPurpose:'owner-reset'|'owner'='owner-reset') {
  return createOwnerAuth(env,resetPurpose);
}
// Better Auth deliberately swallows reset-mail errors to keep public recovery
// responses generic. Invitations need the actual delivery result after saving.
export async function sendOwnerInvitation(env:AppEnv,email:string){
  let delivery:Promise<string>|undefined;
  await createOwnerAuth(env,'owner',pending=>{delivery=pending;}).api.requestPasswordReset({body:{email,redirectTo:env.APP_ORIGIN+'/owner/reset'}});
  if(!delivery)throw new Error('Invitation email was not attempted');
  await delivery;
}
function createOwnerAuth(env:AppEnv,resetPurpose:'owner-reset'|'owner',captureDelivery?:(pending:Promise<string>)=>void) {
  return betterAuth({
    appName:'Rocky Bottom owners',baseURL:env.APP_ORIGIN,basePath:'/api/owner-auth',secret:env.AUTH_SECRET,
    trustedOrigins:[env.APP_ORIGIN],database:drizzleAdapter(drizzle(env.DB),{provider:'sqlite',schema,transaction:false}),
    emailAndPassword:{enabled:true,disableSignUp:true,minPasswordLength:15,maxPasswordLength:128,
      resetPasswordTokenExpiresIn:1800,revokeSessionsOnPasswordReset:true,
      sendResetPassword:async({user,token})=>{const url=env.APP_ORIGIN+'/owner/reset#token='+encodeURIComponent(token);const delivery=sendMail(env,user.email,'Set your Rocky Bottom owner password',`Use this link to set or reset your owner password. It expires in 30 minutes.\n\n${url}\n\nIf you did not request this, ignore this email.`,resetPurpose);captureDelivery?.(delivery);await delivery;},
      onPasswordReset:async({user})=>{await env.DB.batch([
       env.DB.prepare("UPDATE owner_accounts SET status='active' WHERE auth_subject=? AND status='invited'").bind(user.id),
       env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,subject_id,created_at) SELECT ?,id,'owner_password_reset',id,? FROM owner_accounts WHERE auth_subject=? AND status='active'").bind(crypto.randomUUID(),Date.now(),user.id),
      ]);}
    },
    verification:{storeIdentifier:'hashed'},
    session:{expiresIn:8*3600,updateAge:3600,cookieCache:{enabled:false}},
    rateLimit:{enabled:true,storage:'database',window:60,max:15},
    advanced:{cookiePrefix:'rb-owner',useSecureCookies:new URL(env.APP_ORIGIN).protocol==='https:',ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
    logger:{disabled:true},
  });
}
export async function getOwner(env:AppEnv, request:Request) {
  const auth=await ownerAuth(env).api.getSession({headers:request.headers});
  if (!auth) return null;
  return env.DB.prepare("SELECT id,email_normalized FROM owner_accounts WHERE auth_subject=? AND status='active'").bind(auth.user.id).first<{id:string;email_normalized:string}>();
}
