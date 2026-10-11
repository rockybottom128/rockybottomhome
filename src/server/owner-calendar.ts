import type {AppEnv} from './env';
import type {SavedBooking} from './bookings';
import {dayKey,monthDays,plusDays} from '../lib/viewings/calendar.ts';
import {validDay,uniqueInstant} from '../lib/viewings/availability.ts';
export function calendarSelection(params:URLSearchParams,now=Date.now()){
 const today=dayKey(now),raw=params.get('month');
 const month=raw&&validDay(raw+'-01')?raw:today.slice(0,7);
 const selected=params.get('day');
 const day=validDay(selected)&&selected.startsWith(month+'-')?selected:today.startsWith(month+'-')?today:month+'-01';
 const days=monthDays(month);
 return {today,month,day,days,previous:plusDays(month+'-01',-1).slice(0,7),next:plusDays(month+'-01',32).slice(0,7)};
}
export async function ownerCalendar(env:AppEnv,params:URLSearchParams,now=Date.now()){
 const selection=calendarSelection(params,now),{days,day}=selection;
 // One SELECT: counts, calendar and selected-day records share one D1 snapshot.
 // Counts and date markers are not restricted to a latest-100 list.
 const row=await env.DB.prepare(`SELECT
  (SELECT COUNT(*) FROM bookings WHERE status='requested' AND ends_at>?) AS pending,
  (SELECT COUNT(*) FROM bookings WHERE status='approved' AND ends_at>?) AS approved,
  (SELECT COUNT(*) FROM email_outbox WHERE created_at IS NOT NULL AND status IN ('pending','failed','uncertain','sending')) AS attention,
  (SELECT json_group_array(json_object('starts_at',starts_at,'status',status)) FROM bookings WHERE starts_at>=? AND starts_at<? AND status IN ('requested','approved')) AS dates,
  (SELECT json_group_array(json_object('id',b.id,'starts_at',b.starts_at,'ends_at',b.ends_at,'status',b.status,'revision',b.revision,'validation_status',b.validation_status,'cancellation_reason',b.cancellation_reason,'email_normalized',v.email_normalized,'profile_snapshot',b.profile_snapshot)) FROM (SELECT * FROM bookings WHERE starts_at>=? AND starts_at<? ORDER BY CASE WHEN status IN ('requested','approved') THEN 0 ELSE 1 END,starts_at,created_at DESC LIMIT 100) b JOIN visitors v ON v.id=b.visitor_id) AS bookings
 `).bind(now,now,uniqueInstant(days[0],0),uniqueInstant(plusDays(days.at(-1)!,1),0),uniqueInstant(day,0),uniqueInstant(plusDays(day,1),0)).first<{pending:number;approved:number;attention:number;dates:string;bookings:string}>();
 if(!row)throw Error('Calendar unavailable');
 const markers:Record<string,{pending:number;approved:number}>={};
 for(const b of JSON.parse(row.dates) as {starts_at:number;status:string}[]){
  const date=dayKey(b.starts_at),counts=markers[date]??={pending:0,approved:0};
  if(b.status==='requested')counts.pending++;else counts.approved++;
 }
 return {...selection,pending:row.pending,approved:row.approved,attention:row.attention,markers,bookings:JSON.parse(row.bookings) as (SavedBooking & {email_normalized:string})[]};
}
