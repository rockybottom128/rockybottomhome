import type {AppEnv} from './env.ts';
import {normalizeEmail} from './env.ts';
import {active,readPunchList,PunchError,PunchValidationError} from './punch-list.ts';
export const reportDeliveryMode=(env:AppEnv)=>env.MAIL_MODE==='test'?'test':env.MAIL_MODE==='resend'?'resend':'unavailable';
type Item={label:string;created_at:number;completed_at:number|null;creator_email:string;completed_email:string|null};
type Report={id:string;actor_id:string;created_at:number;options_json:string;items_json:string};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Legacy snapshots remain immutable; plain-text cells cannot introduce extra
// lines or pipe-delimited columns. HTML continues to escape the original text.
const plainCell=(s:string)=>s.replace(/[\s\u0000-\u001f\u007f-\u009f]+/g,' ').replace(/\|/g,'¦').trim();
export function reportBody(report:Report,attribution:boolean){
 const options=JSON.parse(report.options_json),items=JSON.parse(report.items_json) as Item[];
 const date=(n:number)=>new Intl.DateTimeFormat('en-US',{timeZone:options.timeZone,dateStyle:'medium',timeStyle:'short'}).format(n);
 const heading=`Rocky Bottom punch list · ${items.length} items`;
 const description=`${options.includeCompleted==='true'?'Open and completed':'Open only'} · ${options.sort} ${options.direction} · ${options.timeZone} · Snapshot ${date(report.created_at)}`;
 const rows=items.map(i=>[i.completed_at===null?'Open':'Completed',i.label,date(i.created_at)+(attribution?' — '+i.creator_email:''),i.completed_at===null?'—':date(i.completed_at)+(attribution?' — '+i.completed_email:'')]);
 return {text:heading+'\n'+description+'\n\n'+rows.map(r=>r.map(plainCell).join(' | ')).join('\n'),html:`<h1>${escape(heading)}</h1><p>${escape(description)}</p><table cellpadding="8" border="1" style="border-collapse:collapse"><thead><tr>${['Status','Item','Created','Completed'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>'<tr>'+r.map(x=>`<td>${escape(x)}</td>`).join('')+'</tr>').join('')}</tbody></table>`};
}
export async function prepareReport(env:AppEnv,actor:string,input:Record<string,unknown>){
 await active(env,actor);
 if(typeof input.id!=='string'||!/^[-a-f0-9]{36}$/.test(input.id))throw new PunchValidationError('Invalid report identifier.');
 const old=await env.DB.prepare('SELECT * FROM punch_reports WHERE id=? AND actor_id=?').bind(input.id,actor).first<Report>();
 // A retried preparation returns its immutable original snapshot; it never creates another send.
 if(old)return reportPreview(env,old);
 const timeZone=typeof input.timeZone==='string'?input.timeZone:'America/New_York';
 try{new Intl.DateTimeFormat('en-US',{timeZone}).format();}catch{throw new PunchValidationError('Invalid report time zone.');}
 const params=new URLSearchParams({sort:String(input.sort??'created'),direction:String(input.direction??'desc'),includeCompleted:String(input.includeCompleted??false)});
 const result=await readPunchList(env,actor,params,true);
 if(!result.items.length)throw new PunchValidationError('No matching items to email.');
 if(!Array.isArray(input.owners)||input.owners.length>10||typeof input.custom!=='string'||input.custom.length>2600)throw new PunchValidationError('Choose up to 10 recipients.');
 const recipients=new Map<string,{owner:string|null;attribution:number}>();
 for(const id of input.owners){
  if(typeof id!=='string')throw new PunchValidationError('Invalid owner selection.');
  const owner=await env.DB.prepare("SELECT id,email_normalized FROM owner_accounts WHERE id=? AND status IN ('active','invited')").bind(id).first<{id:string;email_normalized:string}>();
  if(!owner)throw new PunchError('An owner selection is no longer available. Refresh the page.');
  recipients.set(owner.email_normalized,{owner:owner.id,attribution:1});
 }
 // Explicit custom recipients always receive the privacy-reduced report, including duplicates.
 for(const raw of input.custom.split(/[\s,;]+/).filter(Boolean)){let email:string;try{email=normalizeEmail(raw);}catch{throw new PunchValidationError('Check the custom email addresses.');}recipients.set(email,{owner:null,attribution:0});}
 if(!recipients.size||recipients.size>10)throw new PunchValidationError('Choose between 1 and 10 distinct recipients.');
 const report={id:input.id,actor_id:actor,created_at:Date.now(),options_json:JSON.stringify({...Object.fromEntries(params),timeZone}),items_json:JSON.stringify(result.items)};
 await env.DB.batch([
  env.DB.prepare('INSERT INTO punch_reports VALUES (?,?,?,?,?)').bind(report.id,actor,report.created_at,report.options_json,report.items_json),
  ...[...recipients].map(([email,r])=>env.DB.prepare('INSERT INTO punch_report_deliveries(id,report_id,recipient,owner_id,include_attribution) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),report.id,email,r.owner,r.attribution)),
 ]);
 return reportPreview(env,report);
}
async function reportPreview(env:AppEnv,report:Report){
 const recipients=await env.DB.prepare("SELECT recipient,include_attribution,status,recovery_outcome,(provider_id='local-test') localTest FROM punch_report_deliveries WHERE report_id=? ORDER BY recipient").bind(report.id).all();
 return {id:report.id,preview:reportBody(report,false).text,recipients:recipients.results,deliveryMode:reportDeliveryMode(env)};
}
export async function reportHistory(env:AppEnv,actor:string){
 await active(env,actor);
 const rows=(await env.DB.prepare(`SELECT r.id,r.actor_id,r.created_at,d.recipient,d.status,d.recovery_outcome,(d.provider_id='local-test') localTest FROM punch_reports r JOIN punch_report_deliveries d ON d.report_id=r.id ORDER BY r.created_at DESC,d.recipient LIMIT 100`).all<{id:string;actor_id:string;created_at:number;recipient:string;status:string;recovery_outcome:string|null;localTest:number|null}>()).results;
 return rows.map(({actor_id,...row})=>({...row,canSend:actor_id===actor&&['pending','failed'].includes(row.status)}));
}
type Sender=(to:string,text:string,html:string,key:string)=>Promise<string>;
export async function deliverReport(env:AppEnv,actor:string,id:unknown,send:Sender){
 await active(env,actor);
 if(typeof id!=='string')throw new PunchValidationError('Invalid report identifier.');
 const report=await env.DB.prepare('SELECT * FROM punch_reports WHERE id=? AND actor_id=?').bind(id,actor).first<Report>();
 if(!report)throw new PunchError('Report unavailable for this sender.');
 const deliveries=await env.DB.prepare('SELECT id FROM punch_report_deliveries WHERE report_id=?').bind(id).all<{id:string}>();
 for(const d of deliveries.results){
  const claimed=await env.DB.prepare(`UPDATE punch_report_deliveries SET status='sending',attempted_at=? WHERE id=? AND status IN ('pending','failed') RETURNING recipient,include_attribution,owner_id`).bind(Date.now(),d.id).first<{recipient:string;include_attribution:number;owner_id:string|null}>();
  if(!claimed)continue;
  let receipt:string;
  try{
   await active(env,actor);
   if(claimed.owner_id&&!await env.DB.prepare("SELECT id FROM owner_accounts WHERE id=? AND status IN ('active','invited')").bind(claimed.owner_id).first())throw new PunchError('Selected owner was removed.');
   const body=reportBody(report,Boolean(claimed.include_attribution));
   receipt=await send(claimed.recipient,body.text,body.html,d.id);
  }catch(e){await env.DB.prepare("UPDATE punch_report_deliveries SET status=? WHERE id=? AND status='sending' AND recovery_revision=0").bind(e&&typeof e==='object'&&'uncertain' in e?'uncertain':'failed',d.id).run();continue;}
  // If receipt persistence fails, keep sending/unknown; never make it retryable.
  await env.DB.prepare("UPDATE punch_report_deliveries SET status='sent',sent_at=?,provider_id=? WHERE id=? AND status='sending' AND recovery_revision=0").bind(Date.now(),receipt,d.id).run();
 }
 return reportPreview(env,report);
}
