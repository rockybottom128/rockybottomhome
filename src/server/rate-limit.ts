import type { AppEnv } from './env';
import { digest } from './crypto';
export class RateLimitError extends Error {
  constructor(public retryAfter:number) {
    super(`Please wait ${Math.ceil(retryAfter/60)} minute(s) before trying again. No email was sent by this request.`);
  }
}
export async function limit(env:AppEnv,key:string,max:number,window:number) {
  const now=Date.now();
  const row=await env.DB.prepare(`INSERT INTO request_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count,expires_at`).bind(await digest(key,env.OTP_SECRET),now+window,now,now).first<{count:number;expires_at:number}>();
  if (!row) throw new Error('Rate limit unavailable');
  if (row.count>max) throw new RateLimitError(Math.max(1,Math.ceil((row.expires_at-now)/1000)));
}
