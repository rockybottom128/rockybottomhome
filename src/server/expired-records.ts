import type {AppEnv} from './env';

const day=86400000;
const interval=15*60000;
const batchSize=100;
const leaseKey='maintenance:expired-records:v1';
const nextAttempt=new WeakMap<AppEnv['DB'],number>();

// A shared, expiring D1 claim bounds work across Worker instances. No scheduled
// infrastructure or request-controlled cutoff/limit is involved.
export async function cleanupExpiredRecords(env:Pick<AppEnv,'DB'>,now=Date.now()) {
  const claimed=await env.DB.prepare(`INSERT INTO request_limits(key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=1,expires_at=excluded.expires_at
    WHERE request_limits.expires_at<=? RETURNING key`).bind(leaseKey,now+interval,now).first();
  if(!claimed)return false;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM request_limits WHERE key IN (SELECT key FROM request_limits WHERE expires_at<=? ORDER BY expires_at LIMIT ?)').bind(now,batchSize),
    env.DB.prepare('DELETE FROM visitor_sessions WHERE token_digest IN (SELECT token_digest FROM visitor_sessions WHERE expires_at<=? ORDER BY expires_at LIMIT ?)').bind(now,batchSize),
    env.DB.prepare('DELETE FROM auth_session WHERE id IN (SELECT id FROM auth_session WHERE expires_at<=? ORDER BY expires_at LIMIT ?)').bind(now,batchSize),
    env.DB.prepare('DELETE FROM auth_verification WHERE id IN (SELECT id FROM auth_verification WHERE expires_at<=? ORDER BY expires_at LIMIT ?)').bind(now,batchSize),
    // Better Auth stores milliseconds; current limiter windows are <=60 seconds.
    // Retain a full day of inactivity, far beyond those enforcement windows.
    env.DB.prepare('DELETE FROM auth_rate_limit WHERE id IN (SELECT id FROM auth_rate_limit WHERE last_request<? ORDER BY last_request LIMIT ?)').bind(now-day,batchSize),
    // Keep expired challenges a full day, preserving resend cooldowns and recent
    // activity. Never delete an unexpired challenge (including pending delivery).
    env.DB.prepare('DELETE FROM email_challenges WHERE visitor_id IN (SELECT visitor_id FROM email_challenges WHERE expires_at<? AND last_sent_at<? ORDER BY expires_at LIMIT ?)').bind(now-day,now-day,batchSize),
    // Both child cleanup and this final eligibility check share one transaction.
    // Preserve all business/history references, including those without an FK.
    env.DB.prepare(`DELETE FROM visitors WHERE id IN (
      SELECT v.id FROM visitors v WHERE v.email_verified_at IS NULL
      AND COALESCE(v.last_verification_requested_at,v.created_at)<?
      AND NOT EXISTS(SELECT 1 FROM email_challenges c WHERE c.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM visitor_sessions s WHERE s.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM conversation_threads t WHERE t.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM conversation_threads t WHERE t.creator_role='visitor' AND t.creator_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM booking_cancellations c WHERE c.actor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM visitor_intake_profiles p WHERE p.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM agent_credentials a WHERE a.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM identity_attempts i WHERE i.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM reference_selfies r WHERE r.visitor_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM audit_events a WHERE a.actor_id=v.id OR a.subject_id=v.id)
      AND NOT EXISTS(SELECT 1 FROM conversation_entries e WHERE e.actor_role='visitor' AND e.actor_id=v.id)
      ORDER BY COALESCE(v.last_verification_requested_at,v.created_at) LIMIT ?
    )`).bind(now-day,batchSize),
  ]);
  return true;
}

// Best effort only: maintenance must not change authentication/API responses.
// The per-isolate throttle also limits claim traffic when the shared lease is held.
export async function maybeCleanupExpiredRecords(env:Pick<AppEnv,'DB'>) {
  const now=Date.now();
  if((nextAttempt.get(env.DB)??0)>now)return;
  nextAttempt.set(env.DB,now+10000);
  try{await cleanupExpiredRecords(env,now);}
  catch{console.warn('Expired-record cleanup could not be completed.');}
}
