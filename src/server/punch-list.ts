import type {AppEnv} from './env';

export class PunchError extends Error {}
function text(value:unknown,max:number):string {
 if(typeof value!=='string'||value.trim().length>max||!value.trim())throw new PunchError('Enter an item name between 1 and 120 characters.');
 return value.trim();
}
function id(value:unknown):string {return text(value,64);}
function revision(value:unknown):number {
 if(!Number.isSafeInteger(value)||Number(value)<1)throw new PunchError('Refresh the list before changing this item.');
 return Number(value);
}
async function active(env:AppEnv,owner:string){
 if(!await env.DB.prepare("SELECT id FROM owner_accounts WHERE id=? AND status='active'").bind(owner).first())throw new PunchError('Active owner sign-in required.');
}
export async function openPunchCount(env:AppEnv){
 const result=await env.DB.prepare('SELECT COUNT(*) total FROM punch_tasks WHERE completed_at IS NULL').first<{total:number}>();
 return result?.total??0;
}
export async function readPunchList(env:AppEnv,owner:string,params:URLSearchParams){
 await active(env,owner);
 const columns:Record<string,string>={name:'p.label COLLATE NOCASE',status:'(p.completed_at IS NOT NULL)',created:'p.created_at',completed:'p.completed_at'};
 const sort=params.get('sort')||'created',direction=params.get('direction')||'desc';
 if(!Object.hasOwn(columns,sort)||!['asc','desc'].includes(direction))throw new PunchError('Invalid sort order.');
 const include=params.get('includeCompleted')||'false';if(!['true','false'].includes(include))throw new PunchError('Invalid completed-items option.');
 const offset=Number(params.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new PunchError('Invalid page.');
 const items=await env.DB.prepare(`SELECT p.*,a.email_normalized creator_email,c.email_normalized completed_email
 FROM punch_tasks p JOIN owner_accounts a ON a.id=p.creator_id LEFT JOIN owner_accounts c ON c.id=p.completed_by
 ${include==='true'?'':'WHERE p.completed_at IS NULL'} ORDER BY ${columns[sort]} ${direction.toUpperCase()},p.id ASC LIMIT 51 OFFSET ?`).bind(offset).all();
 return {items:items.results.slice(0,50),hasMore:items.results.length>50,openCount:await openPunchCount(env)};
}
export async function changePunchList(env:AppEnv,owner:string,input:Record<string,unknown>){
 await active(env,owner);const action=input.action;const now=Date.now();let result;
 if(action==='create'){
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
  }else throw new PunchError('Unknown punch list action.');
 }
 if(!result?.meta.changes)throw new PunchError('Change not saved. Another owner may have changed this item. Refresh the list and try again.');
 return {ok:true};
}
