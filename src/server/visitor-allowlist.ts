import {normalizeEmail,type AppEnv} from './env.ts';
export type AllowlistEntry={id:string;kind:'domain'|'email';value:string};
export class AllowlistConflict extends Error {}
export function validateAllowlistEntry(kind:unknown,value:unknown):Pick<AllowlistEntry,'kind'|'value'>{
 if(typeof value!=='string')throw Error('Enter a domain or email address.');
 const normalized=value.trim().toLowerCase();
 if(kind==='email'){const email=normalizeEmail(normalized);validateAllowlistEntry('domain',email.slice(email.lastIndexOf('@')+1));return {kind,value:email};}
 if(kind!=='domain'||normalized.length>253||!normalized.includes('.')||!normalized.split('.').every(p=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p))||!/^[a-z]{2,}$/.test(normalized.split('.').at(-1)!))throw Error('Enter a domain such as example.com, without @, a URL, or a wildcard.');
 return {kind,value:normalized};
}
export async function ensureAllowlist(env:AppEnv){
 const state=await env.DB.prepare('SELECT initialized FROM visitor_allowlist_state WHERE id=1').first<{initialized:number}>();
 if(!state)throw Error('Visitor allowlist migration is required.');
 if(state.initialized)return;
 const entries=new Map<string,Pick<AllowlistEntry,'kind'|'value'>>();
 for(const [kind,values] of [['domain',env.VISITOR_EMAIL_DOMAINS],['email',env.MAIL_ALLOWED_RECIPIENTS],['email',env.VISITOR_EMAIL_ADDRESSES]]){
  for(const raw of (values??'').split(',').filter(s=>s.trim())){const p=validateAllowlistEntry(kind,raw);entries.set(p.kind+':'+p.value,p);}
 }
 const token=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM visitor_allowlist_state WHERE id=1 AND mutation_id=?)';
 // One atomic claim/import: simultaneous first requests cannot reseed or overwrite edits.
 await env.DB.batch([
  env.DB.prepare('UPDATE visitor_allowlist_state SET initialized=1,revision=1,mutation_id=? WHERE id=1 AND initialized=0').bind(token),
  ...[...entries.values()].map(p=>env.DB.prepare(`INSERT INTO visitor_allowlist_entries(id,kind,value) SELECT ?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),p.kind,p.value,token)),
  env.DB.prepare(`INSERT INTO visitor_allowlist_audit(revision,actor_id,action,before_json,after_json,created_at) SELECT 1,NULL,'import',NULL,?,? WHERE ${guard}`).bind(JSON.stringify([...entries.values()]),Date.now(),token),
 ]);
}
export async function readAllowlist(env:AppEnv){
 await ensureAllowlist(env);
 const result=await env.DB.prepare(`SELECT s.revision,e.id,e.kind,e.value FROM visitor_allowlist_state s LEFT JOIN visitor_allowlist_entries e ON 1=1 WHERE s.id=1 ORDER BY e.kind,e.value`).all<AllowlistEntry & {revision:number}>();
 if(!result.results.length)throw Error('Allowlist unavailable');
 return {revision:result.results[0].revision,entries:result.results.filter(r=>r.id).map(({id,kind,value})=>({id,kind,value}))};
}
export async function allowedVisitorEmail(env:AppEnv,email:string){
 const normalized=normalizeEmail(email);
 await ensureAllowlist(env);
 return !!await env.DB.prepare("SELECT id FROM visitor_allowlist_entries WHERE (kind='email' AND value=?) OR (kind='domain' AND value=?) LIMIT 1").bind(normalized,normalized.slice(normalized.lastIndexOf('@')+1)).first();
}
export async function changeAllowlist(env:AppEnv,ownerId:string,input:Record<string,unknown>){
 const {action,revision,id}=input;
 if(!['add','update','remove'].includes(String(action))||!Number.isSafeInteger(revision)||Number(revision)<1)throw Error('Invalid allowlist change.');
 const state=await readAllowlist(env),before=state.entries.find(e=>e.id===id);
 if(state.revision!==revision||(action!=='add'&&!before))throw new AllowlistConflict('This list changed. Reload the list before editing again.');
 const entry=action==='remove'?null:validateAllowlistEntry(input.kind,input.value);
 if(entry&&state.entries.some(e=>e.id!==id&&e.kind===entry.kind&&e.value===entry.value))throw Error('That domain or email is already listed.');
 const entryId=action==='add'?crypto.randomUUID():String(id),token=crypto.randomUUID();
 const guard='EXISTS(SELECT 1 FROM visitor_allowlist_state WHERE id=1 AND mutation_id=?)';
 const mutate=action==='remove'?env.DB.prepare(`DELETE FROM visitor_allowlist_entries WHERE id=? AND ${guard}`).bind(entryId,token):action==='add'?env.DB.prepare(`INSERT INTO visitor_allowlist_entries(id,kind,value) SELECT ?,?,? WHERE ${guard}`).bind(entryId,entry!.kind,entry!.value,token):env.DB.prepare(`UPDATE visitor_allowlist_entries SET kind=?,value=? WHERE id=? AND ${guard}`).bind(entry!.kind,entry!.value,entryId,token);
 const result=await env.DB.batch([
  env.DB.prepare("UPDATE visitor_allowlist_state SET revision=revision+1,mutation_id=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM owner_accounts WHERE id=? AND status='active')").bind(token,revision,ownerId),
  mutate,
  env.DB.prepare(`INSERT INTO visitor_allowlist_audit(revision,actor_id,action,before_json,after_json,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(Number(revision)+1,ownerId,action,JSON.stringify(before??null),JSON.stringify(entry?{id:entryId,...entry}:null),Date.now(),token),
 ]);
 if(result[0].meta.changes!==1)throw new AllowlistConflict('This list or your owner access changed. Reload before trying again.');
 return readAllowlist(env);
}
