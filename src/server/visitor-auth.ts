import { code, digest, equal, token } from './crypto';
import type { AppEnv } from './env';
import { sendMail } from './mail';
import { limit, RateLimitError } from './rate-limit';
export { limit } from './rate-limit';
export async function sendVisitorCode(env:AppEnv,email:string,ip:string) {
  await limit(env,'send-ip:'+ip,10,3600000);
  const now=Date.now(),generation=token(),otp=code();
  await env.DB.prepare('INSERT INTO visitors(id,email_normalized,created_at) VALUES (?,?,?) ON CONFLICT(email_normalized) DO NOTHING').bind(crypto.randomUUID(),email,now).run();
  const visitor=await env.DB.prepare('SELECT id FROM visitors WHERE email_normalized=?').bind(email).first<{id:string}>();
  if (!visitor) throw new Error('Could not begin verification.');
  const hash=await digest(`${visitor.id}:${generation}:${otp}`,env.OTP_SECRET);
  const reserved=await env.DB.prepare(`INSERT INTO email_challenges(visitor_id,generation,code_digest,expires_at,attempts,consumed_at,last_sent_at,delivery) VALUES (?,?,?,?,0,NULL,?,'pending') ON CONFLICT(visitor_id) DO UPDATE SET generation=excluded.generation,code_digest=excluded.code_digest,expires_at=excluded.expires_at,attempts=0,consumed_at=NULL,last_sent_at=excluded.last_sent_at,delivery='pending' WHERE email_challenges.last_sent_at<=? RETURNING generation`).bind(visitor.id,generation,hash,now+600000,now,now-60000).first();
  if (!reserved) throw new Error('Please wait 60 seconds before requesting another code.');
  try {
    await sendMail(env,email,'Your Rocky Bottom verification code',`Your verification code is ${otp}.\n\nIt expires in 10 minutes. Only the latest code works. If you did not request this, ignore this message.`);
    await env.DB.prepare("UPDATE email_challenges SET delivery='sent' WHERE visitor_id=? AND generation=?").bind(visitor.id,generation).run();
  } catch(error) {
    await env.DB.prepare("UPDATE email_challenges SET delivery='failed' WHERE visitor_id=? AND generation=?").bind(visitor.id,generation).run();
    if(error instanceof RateLimitError) throw error;
    throw new Error('We could not send a code. Please wait a minute and try again.');
  }
}
export async function verifyVisitorCode(env:AppEnv,email:string,entered:string,ip:string):Promise<string|null> {
  await limit(env,'verify-ip:'+ip,30,60000);
  if (!/^\d{8}$/.test(entered)) return null;
  const now=Date.now();
  const row=await env.DB.prepare(`UPDATE email_challenges SET attempts=attempts+1 WHERE visitor_id=(SELECT id FROM visitors WHERE email_normalized=?) AND attempts<5 AND consumed_at IS NULL AND expires_at>? AND delivery='sent' RETURNING visitor_id,generation,code_digest`).bind(email,now).first<{visitor_id:string;generation:string;code_digest:string}>();
  if (!row || !equal(row.code_digest,await digest(`${row.visitor_id}:${row.generation}:${entered}`,env.OTP_SECRET))) return null;
  const session=token(),sessionHash=await digest(session,env.OTP_SECRET);
  // D1 batch is atomic. Only one session can consume a given generation, even concurrently.
  const results=await env.DB.batch([
    env.DB.prepare(`INSERT INTO visitor_sessions(token_digest,visitor_id,expires_at,challenge_generation) SELECT ?,visitor_id,?,generation FROM email_challenges WHERE visitor_id=? AND generation=? AND consumed_at IS NULL AND expires_at>? AND delivery='sent' ON CONFLICT DO NOTHING`).bind(sessionHash,now+3600000,row.visitor_id,row.generation,now),
    env.DB.prepare('UPDATE email_challenges SET consumed_at=? WHERE visitor_id=? AND generation=? AND EXISTS(SELECT 1 FROM visitor_sessions WHERE token_digest=?)').bind(now,row.visitor_id,row.generation,sessionHash),
    env.DB.prepare('UPDATE visitors SET email_verified_at=? WHERE id=? AND EXISTS(SELECT 1 FROM visitor_sessions WHERE token_digest=?)').bind(now,row.visitor_id,sessionHash),
  ]);
  return results[0].meta.changes===1 ? session : null;
}
export function visitorCookie(env:AppEnv,value:string,maxAge=3600) { return `rb-visitor=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env.APP_ORIGIN.startsWith('https:')?'; Secure':''}`; }
export async function getVisitor(env:AppEnv,request:Request) {
  const value=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('rb-visitor='))?.slice(11);
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  return env.DB.prepare('SELECT v.id,v.email_normalized,v.email_verified_at FROM visitors v JOIN visitor_sessions s ON s.visitor_id=v.id WHERE s.token_digest=? AND s.expires_at>? AND s.revoked_at IS NULL').bind(await digest(value,env.OTP_SECRET),Date.now()).first<{id:string;email_normalized:string;email_verified_at:number}>();
}
