import type { AppEnv } from './env';
export type VisitorProfile={role:'buyer'|'agent';display_name:string;licensed_name:string;jurisdiction:string;license_number:string;brokerage:string;validation_status:'simulated_pass';revision:number;updated_at:number};
export class ProfileConflict extends Error {}
function text(value:unknown,label:string,max:number):string {
 if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))throw Error(`Enter ${label} (1–${max} characters).`);
 return value.trim();
}
export function validateProfile(input:Record<string,unknown>) {
 if(input.role!=='agent'&&input.role!=='buyer')throw Error('Choose visitor or agent.');
 const agent=input.role==='agent';
 return {role:input.role,display_name:text(input.display_name,'your name',120),licensed_name:agent?text(input.licensed_name,'the licensed name',120):'',jurisdiction:agent?text(input.jurisdiction,'the issuing state or jurisdiction',80):'',license_number:agent?text(input.license_number,'the license number',80):'',brokerage:agent?text(input.brokerage,'the brokerage',160):''};
}
export async function readProfile(env:AppEnv,visitorId:string):Promise<VisitorProfile|null> {
 return env.DB.prepare('SELECT role,display_name,licensed_name,jurisdiction,license_number,brokerage,validation_status,revision,updated_at FROM visitor_intake_profiles WHERE visitor_id=?').bind(visitorId).first<VisitorProfile>();
}
export async function saveProfile(env:AppEnv,visitorId:string,input:Record<string,unknown>) {
 const p=validateProfile(input),revision=input.revision;
 if(!Number.isSafeInteger(revision)||Number(revision)<0)throw Error('Invalid profile revision.');
 const next=Number(revision)+1,now=Date.now(),event=crypto.randomUUID();
 // Audit is conditional on the same revision as the write. Batch rollback keeps
 // both records consistent; no browser-selected visitor ID or validation status.
 const result=await env.DB.batch([
  env.DB.prepare(`INSERT INTO audit_events(id,actor_id,action,subject_id,created_at)
   SELECT ?,?,'visitor_profile_saved',?,? WHERE EXISTS(SELECT 1 FROM visitors WHERE id=? AND email_verified_at IS NOT NULL)
   AND COALESCE((SELECT revision FROM visitor_intake_profiles WHERE visitor_id=?),0)=?`).bind(event,visitorId,visitorId,now,visitorId,visitorId,revision),
  env.DB.prepare(`INSERT INTO visitor_intake_profiles(visitor_id,role,display_name,licensed_name,jurisdiction,license_number,brokerage,validation_status,revision,updated_at)
   SELECT ?,?,?,?,?,?,?,'simulated_pass',?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)
   ON CONFLICT(visitor_id) DO UPDATE SET role=excluded.role,display_name=excluded.display_name,licensed_name=excluded.licensed_name,jurisdiction=excluded.jurisdiction,license_number=excluded.license_number,brokerage=excluded.brokerage,validation_status=excluded.validation_status,revision=excluded.revision,updated_at=excluded.updated_at`).bind(visitorId,p.role,p.display_name,p.licensed_name,p.jurisdiction,p.license_number,p.brokerage,next,now,event),
 ]);
 if(result[0].meta.changes!==1)throw new ProfileConflict('Your saved profile changed. Reload before editing again.');
 return {...p,validation_status:'simulated_pass' as const,revision:next,updated_at:now};
}
