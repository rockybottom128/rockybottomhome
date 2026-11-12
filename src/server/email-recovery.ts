import type {AppEnv} from './env';
export class RecoveryValidation extends Error {}
export class RecoveryConflict extends Error {}
const staleAfter=15*60000;
const tables={booking:'email_outbox',report:'punch_report_deliveries'} as const;
function kindOf(value:unknown):keyof typeof tables {
 if(value!=='booking'&&value!=='report')throw new RecoveryValidation('Choose a booking email or report recipient.');return value;
}
function identifier(value:unknown){
 if(typeof value!=='string'||!value||value.length>64||/[\s\u0000-\u001f\u007f]/.test(value))throw new RecoveryValidation('Invalid delivery identifier.');return value;
}
async function active(env:AppEnv,actor:string){
 if(!await env.DB.prepare("SELECT id FROM owner_accounts WHERE id=? AND status='active'").bind(actor).first())throw new RecoveryConflict('Owner access changed. Sign in again.');
}
export async function recoveryList(env:AppEnv,actor:string,now=Date.now()){
 await active(env,actor);
 const rows=(await env.DB.prepare(`SELECT * FROM (
  SELECT 'booking' kind,e.id,v.email_normalized recipient,e.kind subject,e.status,e.attempted_at,e.created_at,e.recovery_outcome,e.recovery_revision
  FROM email_outbox e JOIN bookings b ON b.id=e.booking_id JOIN visitors v ON v.id=b.visitor_id
  WHERE e.created_at IS NOT NULL AND e.payload_json IS NOT NULL AND e.status IN ('sending','uncertain')
  UNION ALL
  SELECT 'report' kind,d.id,d.recipient,'Punch-list report' subject,d.status,d.attempted_at,r.created_at,d.recovery_outcome,d.recovery_revision
  FROM punch_report_deliveries d JOIN punch_reports r ON r.id=d.report_id WHERE d.status IN ('sending','uncertain')
 ) ORDER BY CASE WHEN recovery_outcome IN ('accepted','not_accepted') THEN 1 ELSE 0 END,COALESCE(attempted_at,created_at),kind,id LIMIT 101`).all<{kind:string;id:string;recipient:string;subject:string;status:string;attempted_at:number|null;created_at:number;recovery_outcome:string|null;recovery_revision:number}>()).results;
 return {items:rows.slice(0,100).map(row=>({...row,canFlag:row.status==='sending'&&row.attempted_at!==null&&row.attempted_at<=now-staleAfter,canReview:row.status==='uncertain'})),hasMore:rows.length>100};
}
export async function recoveryHistory(env:AppEnv,actor:string,kind:unknown,id:unknown){
 await active(env,actor);const type=kindOf(kind),delivery=identifier(id);
 return (await env.DB.prepare(`SELECT r.outcome,r.evidence,r.provider_receipt,r.created_at,r.revision,a.email_normalized reviewer
 FROM email_recovery_reviews r JOIN owner_accounts a ON a.id=r.actor_id
 WHERE r.kind=? AND r.delivery_id=? ORDER BY r.revision DESC LIMIT 20`).bind(type,delivery).all()).results;
}
export async function reviewEmail(env:AppEnv,actor:string,input:Record<string,unknown>,now=Date.now()){
 await active(env,actor);
 const kind=kindOf(input.kind),id=identifier(input.id),table=tables[kind];
 if(!Number.isSafeInteger(input.revision)||Number(input.revision)<0)throw new RecoveryValidation('Invalid review revision. Refresh the delivery record.');
 if(typeof input.request_key!=='string'||!/^[-a-f0-9]{36}$/.test(input.request_key))throw new RecoveryValidation('Invalid review request.');
 const outcome=input.outcome;
 if(typeof outcome!=='string'||!['flagged','accepted','not_accepted','unknown'].includes(outcome))throw new RecoveryValidation('Choose a review outcome.');
 const evidence=typeof input.evidence==='string'?input.evidence.trim():'';
 const receipt=typeof input.provider_receipt==='string'?input.provider_receipt.trim():'';
 if(outcome!=='flagged'&&(evidence.length<10||evidence.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(evidence)))throw new RecoveryValidation('Record how the provider outcome was checked (10–1000 characters).');
 if(outcome==='accepted'&&(!receipt||receipt.length>128||!/^[a-zA-Z0-9_-]+$/.test(receipt)))throw new RecoveryValidation('Enter the provider receipt ID for confirmed acceptance.');
 if(['accepted','not_accepted'].includes(String(outcome))&&input.confirmed!==true)throw new RecoveryValidation('Confirm that you checked the provider record.');
 const note=outcome==='flagged'?'Flagged after at least 15 minutes without a confirmed outcome.':evidence;
 const provider=outcome==='accepted'?receipt:'';
 const signature=JSON.stringify([kind,id,input.revision,outcome,note,provider]);
 const replay=async()=>{
  const row=await env.DB.prepare('SELECT request_signature,revision FROM email_recovery_reviews WHERE actor_id=? AND request_key=?').bind(actor,input.request_key).first<{request_signature:string;revision:number}>();
  if(row&&row.request_signature!==signature)throw new RecoveryConflict('This review request was already used for different details. Refresh before saving again.');
  return row?{ok:true,revision:row.revision}:null;
 };
 const previous=await replay();if(previous)return previous;
 const reviewId=crypto.randomUUID();
 // The review and state transition commit together. Recheck access and the
 // viewed revision inside the transaction; duplicate requests never audit twice.
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO email_recovery_reviews(id,kind,delivery_id,actor_id,outcome,evidence,provider_receipt,attempted_at,previous_status,revision,created_at,request_key,request_signature)
   SELECT ?,?,id,?,?,?,?,attempted_at,status,recovery_revision+1,?,?,? FROM ${table}
   WHERE id=? AND recovery_revision=? AND ${kind==='booking'?'created_at IS NOT NULL AND payload_json IS NOT NULL AND ':''}
   ${outcome==='flagged'?"status='sending' AND attempted_at IS NOT NULL AND attempted_at<=?":"status='uncertain'"}
   AND EXISTS(SELECT 1 FROM owner_accounts WHERE id=? AND status='active')
   ON CONFLICT(actor_id,request_key) DO NOTHING`).bind(reviewId,kind,actor,outcome,note,provider,now,input.request_key,signature,id,input.revision,...(outcome==='flagged'?[now-staleAfter]:[]),actor),
  env.DB.prepare(`UPDATE ${table} SET status='uncertain',recovery_outcome=?,recovery_revision=recovery_revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM email_recovery_reviews WHERE id=?)`).bind(outcome==='flagged'?null:outcome,id,reviewId),
  env.DB.prepare("INSERT INTO audit_events(id,actor_id,action,subject_id,created_at) SELECT ?,?,'email_delivery_reviewed',?,? WHERE EXISTS(SELECT 1 FROM email_recovery_reviews WHERE id=?)").bind(crypto.randomUUID(),actor,id,now,reviewId),
 ]);
 const saved=await replay();if(saved)return saved;
 throw new RecoveryConflict('The delivery changed or is not ready for this action. Refresh before reviewing again.');
}
