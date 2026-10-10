import type { AppEnv } from './env';
import { validatePeriod, type CalendarState, type Period } from '../lib/viewings/availability.ts';
export class CalendarConflict extends Error {}
export async function readCalendar(env:AppEnv):Promise<CalendarState> {
 // One query provides an internally consistent revision and complete snapshot.
 const result=await env.DB.prepare('SELECT s.revision,p.* FROM calendar_state s LEFT JOIN calendar_periods p ON 1=1 WHERE s.id=1 ORDER BY p.local_day,p.weekday,p.start_minute,p.id').all<Period & {revision:number}>();
 if(!result.results.length)throw Error('Calendar migration is required.');
 return {revision:result.results[0].revision,periods:result.results.filter(p=>p.id!==null).map(({revision,...p})=>p)};
}
export async function changeCalendar(env:AppEnv,ownerId:string,input:Record<string,unknown>) {
 const {revision,action}=input;
 if(!Number.isSafeInteger(revision)||Number(revision)<0||!['add','update','remove'].includes(String(action)))throw Error('Invalid calendar change.');
 const id=action==='add'?crypto.randomUUID():input.id;
 if(typeof id!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(id))throw Error('Invalid period.');
 const p=action==='remove'?null:validatePeriod(input.period),token=crypto.randomUUID(),now=Date.now();
 const guard="EXISTS(SELECT 1 FROM calendar_state WHERE id=1 AND mutation_id=?)";
 const statements=[env.DB.prepare(`UPDATE calendar_state SET revision=revision+1,mutation_id=?,updated_by=?,updated_at=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM owner_accounts WHERE id=? AND status='active') AND ${action==='add'?'(SELECT COUNT(*) FROM calendar_periods)<500':'EXISTS(SELECT 1 FROM calendar_periods WHERE id=?)'}`).bind(token,ownerId,now,revision,ownerId,...(action==='add'?[]:[id])),
 env.DB.prepare(`INSERT INTO calendar_audit(revision,actor_id,period_id,action,before_json,after_json,created_at) SELECT revision,updated_by,?,?,(SELECT json_object('id',id,'kind',kind,'local_day',local_day,'weekday',weekday,'start_minute',start_minute,'end_minute',end_minute) FROM calendar_periods WHERE id=?),?,updated_at FROM calendar_state WHERE id=1 AND mutation_id=?`).bind(id,action,id,p?JSON.stringify({id,...p}):null,token)];
 if(action==='remove')statements.push(env.DB.prepare(`DELETE FROM calendar_periods WHERE id=? AND ${guard}`).bind(id,token));
 else if(action==='add')statements.push(env.DB.prepare(`INSERT INTO calendar_periods SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(id,p!.kind,p!.local_day,p!.weekday,p!.start_minute,p!.end_minute,token));
 else statements.push(env.DB.prepare(`UPDATE calendar_periods SET kind=?,local_day=?,weekday=?,start_minute=?,end_minute=? WHERE id=? AND ${guard}`).bind(p!.kind,p!.local_day,p!.weekday,p!.start_minute,p!.end_minute,id,token));
 // D1 batch is a transaction: revision, audit and period all commit or all roll back.
 const result=await env.DB.batch(statements);
 if(result[0].meta.changes!==1)throw new CalendarConflict('Calendar changed, access changed, or the 500-period limit was reached. Reload the calendar and review before retrying.');
 return {revision:Number(revision)+1};
}
