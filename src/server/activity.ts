import type { AppEnv } from './env';
import { validatePeriod, wallTime } from '../lib/viewings/availability.ts';
import { timeRange } from '../lib/viewings/calendar.ts';
type ActivityRow = { id:string; created_at:number; actor:string; action:string; subject:string; before_json:string|null; after_json:string|null;booking_start:number|null };
const actions:Record<string,string>={visitor_profile_saved:'Visitor profile saved · validation simulated',booking_requested:'Viewing requested',booking_approved:'Viewing approved',booking_canceled:'Viewing canceled',owner_invited:'Owner invited',owner_reinvited:'Owner reinvited',owner_removed:'Owner access removed',visitor_demo_enabled:'Visitor demo enabled',visitor_demo_disabled:'Visitor demo disabled',visitor_email_verified:'Visitor email verified',owner_password_reset:'Owner password set or reset'};
function periodDescription(raw:string|null):string {
 if(!raw)return '';
 try{const p=validatePeriod(JSON.parse(raw));return `${p.kind==='available'?'Available':'Blocked'} · ${p.local_day??(p.weekday===-1?'Every day':`Every ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][p.weekday!]}`)} · ${timeRange(wallTime(p.start_minute),wallTime(p.end_minute))}`;}
 catch{return 'Period details unavailable';}
}
export async function readActivity(env:AppEnv) {
 const rows=await env.DB.prepare(`SELECT * FROM (
  SELECT 'calendar-' || c.revision AS id,c.created_at,COALESCE(o.email_normalized,'Owner') AS actor,'calendar_' || c.action AS action,'' AS subject,c.before_json,c.after_json,NULL AS booking_start
  FROM calendar_audit c LEFT JOIN owner_accounts o ON o.id=c.actor_id
  UNION ALL
  SELECT a.id,a.created_at,COALESCE(o.email_normalized,v.email_normalized,CASE WHEN a.actor_id IN ('setup','local-operator') THEN 'Account setup' ELSE 'System' END) AS actor,a.action,COALESCE(target.email_normalized,visitor.email_normalized,booking_visitor.email_normalized,'') AS subject,NULL AS before_json,NULL AS after_json,booking.starts_at AS booking_start
  FROM audit_events a LEFT JOIN owner_accounts o ON o.id=a.actor_id LEFT JOIN visitors v ON v.id=a.actor_id
  LEFT JOIN owner_accounts target ON target.id=a.subject_id LEFT JOIN visitors visitor ON visitor.id=a.subject_id LEFT JOIN bookings booking ON booking.id=a.subject_id LEFT JOIN visitors booking_visitor ON booking_visitor.id=booking.visitor_id
 ) ORDER BY created_at DESC,id DESC LIMIT 50`).all<ActivityRow>();
 return rows.results.map(r=>({id:r.id,createdAt:r.created_at,actor:r.actor,
  title:r.action.startsWith('calendar_')?({calendar_add:'Calendar period added',calendar_update:'Calendar period updated',calendar_remove:'Calendar period removed'}[r.action]??'Calendar changed'):(actions[r.action]??'Recorded account activity'),
  detail:r.action==='calendar_update'?`${periodDescription(r.before_json)} → ${periodDescription(r.after_json)}`:r.action.startsWith('calendar_')?periodDescription(r.after_json??r.before_json):r.subject+(r.booking_start?' · '+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(r.booking_start)+' Eastern':''),
 }));
}
