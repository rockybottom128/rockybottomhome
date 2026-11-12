import type {AppEnv} from './env.ts';

export class PunchError extends Error {}
export class PunchValidationError extends PunchError {}
export class PunchDuplicateError extends PunchError {}
const nonPrintable=/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
export const normalizedPunchName=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
function text(value:unknown,max:number):string {
 if(typeof value!=='string'||nonPrintable.test(value)||value.trim().length>max||!value.trim())throw new PunchValidationError('Enter an item name between 1 and 120 printable characters on one line.');
 return value.trim();
}
function id(value:unknown):string {
 if(typeof value!=='string'||nonPrintable.test(value)||!value.trim()||value.trim().length>64)throw new PunchValidationError('Invalid item or submission identifier.');
 return value.trim();
}
function revision(value:unknown):number {
 if(!Number.isSafeInteger(value)||Number(value)<1)throw new PunchValidationError('Invalid item revision. Refresh the list before changing this item.');
 return Number(value);
}
export async function active(env:AppEnv,owner:string){
 if(!await env.DB.prepare("SELECT id FROM owner_accounts WHERE id=? AND status='active'").bind(owner).first())throw new PunchError('Active owner sign-in required.');
}
export async function openPunchCount(env:AppEnv){
 const result=await env.DB.prepare('SELECT COUNT(*) total FROM punch_tasks WHERE completed_at IS NULL').first<{total:number}>();
 return result?.total??0;
}
export async function readPunchList(env:AppEnv,owner:string,params:URLSearchParams,all=false){
 await active(env,owner);
 const columns:Record<string,string>={name:'p.label COLLATE NOCASE',status:'(p.completed_at IS NOT NULL)',created:'p.created_at',completed:'p.completed_at'};
 const sort=params.get('sort')||'created',direction=params.get('direction')||'desc';
 if(!Object.hasOwn(columns,sort)||!['asc','desc'].includes(direction))throw new PunchValidationError('Invalid sort order.');
 const include=params.get('includeCompleted')||'false';if(!['true','false'].includes(include))throw new PunchValidationError('Invalid completed-items option.');
 const offset=Number(params.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new PunchValidationError('Invalid page.');
 const items=await env.DB.prepare(`SELECT p.*,a.email_normalized creator_email,c.email_normalized completed_email
 FROM punch_tasks p JOIN owner_accounts a ON a.id=p.creator_id LEFT JOIN owner_accounts c ON c.id=p.completed_by
 ${include==='true'?'':'WHERE p.completed_at IS NULL'} ORDER BY ${columns[sort]} ${direction.toUpperCase()},p.id ASC LIMIT ? OFFSET ?`).bind(all?2001:51,all?0:offset).all();
 if(all&&items.results.length>2000)throw new PunchValidationError('Report exceeds 2,000 items. No report was created.');
 return {items:all?items.results:items.results.slice(0,50),hasMore:items.results.length>50,openCount:await openPunchCount(env)};
}
export async function changePunchList(env:AppEnv,owner:string,input:Record<string,unknown>){
 await active(env,owner);const action=input.action;const now=Date.now();let result;
 if(action==='bulk-create'){
  const batchId=id(input.id);
  if(typeof input.labels!=='string')throw new PunchValidationError('Enter one item per line.');
  const lines=input.labels.split(/\r\n|\r|\n/).map((raw,index)=>({raw,label:raw.trim(),line:index+1}));
  for(const row of lines)if(nonPrintable.test(row.raw)||row.label.length>120)throw new PunchValidationError(`Line ${row.line}: use 1–120 printable characters.`);
  const labels=lines.filter(x=>x.label);
  if(!labels.length||labels.length>100)throw new PunchValidationError('Enter between 1 and 100 nonblank lines.');
  const payload=JSON.stringify(labels.map(x=>x.label));
  const previous=await env.DB.prepare('SELECT actor_id,payload FROM punch_batches WHERE id=?').bind(batchId).first<{actor_id:string;payload:string}>();
  if(previous){if(previous.actor_id===owner&&previous.payload===payload)return {ok:true};throw new PunchError('This submission changed after saving. Refresh before adding again.');}
  if(input.allowDuplicates!==true){
   const existing=(await env.DB.prepare('SELECT label,completed_at FROM punch_tasks').all<{label:string;completed_at:number|null}>()).results;
   const known=new Map<string,Set<string>>();
   for(const row of existing){const key=normalizedPunchName(row.label);const states=known.get(key)??new Set<string>();states.add(row.completed_at===null?'open':'completed');known.set(key,states);}
   const seen=new Map<string,number>(),warnings:string[]=[];
   for(const row of labels){const key=normalizedPunchName(row.label),first=seen.get(key);if(first!==undefined)warnings.push(`Line ${row.line} repeats line ${first}`);else seen.set(key,row.line);const states=known.get(key);if(states)warnings.push(`Line ${row.line} matches an existing ${[...states].join('/')} item`);}
   if(warnings.length)throw new PunchDuplicateError('Duplicate names: '+warnings.join('; ')+'. Nothing added. Edit the entries or explicitly allow duplicate names to keep every line.');
  }
  await env.DB.batch([
   env.DB.prepare('INSERT INTO punch_batches(id,actor_id,payload) VALUES (?,?,?)').bind(batchId,owner,payload),
   ...labels.map((row,index)=>env.DB.prepare('INSERT INTO punch_tasks(id,label,creator_id,created_at,updated_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),row.label,owner,now+index,now)),
  ]);
  return {ok:true};
 }else if(action==='create'){
  const itemId=id(input.id),label=text(input.label,120);
  const previous=await env.DB.prepare('SELECT creator_id,label FROM punch_tasks WHERE id=?').bind(itemId).first<{creator_id:string;label:string}>();
  if(previous){if(previous.creator_id===owner&&previous.label===label)return {ok:true};throw new PunchError('This item was already saved. Refresh the list.');}
  result=await env.DB.prepare('INSERT INTO punch_tasks(id,label,creator_id,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(itemId,label,owner,now,now).run();
 }else{
  const itemId=id(input.id),rev=revision(input.revision);
  if(action==='edit'){
   result=await env.DB.prepare('UPDATE punch_tasks SET label=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?').bind(text(input.label,120),now,itemId,rev).run();
  }else if(action==='complete'){
   result=await env.DB.prepare('UPDATE punch_tasks SET completed_at=?,completed_by=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND completed_at IS NULL').bind(now,owner,now,itemId,rev).run();
  }else if(action==='reopen'){
   result=await env.DB.prepare('UPDATE punch_tasks SET completed_at=NULL,completed_by=NULL,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND completed_at IS NOT NULL').bind(now,itemId,rev).run();
  }else throw new PunchValidationError('Unknown punch list action.');
 }
 if(!result?.meta.changes)throw new PunchError('Change not saved. Another owner may have changed this item. Refresh the list and try again.');
 return {ok:true};
}
