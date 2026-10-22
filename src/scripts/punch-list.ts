import {post} from './auth-request';
type Item={id:string;label:string;creator_email:string;completed_email:string|null;created_at:number;completed_at:number|null;revision:number};
type Data={items:Item[];hasMore:boolean;openCount:number};
type Sort='name'|'status'|'created'|'completed';
const root=document.getElementById('punch-list')!;
const get=<T=HTMLElement>(id:string)=>document.getElementById(id) as unknown as T;
const create=get<HTMLFormElement>('punch-create'),newName=get<HTMLInputElement>('punch-label'),notice=get('punch-result');
let data:Data={items:[],hasMore:false,openCount:0},offset=0,sort:Sort='created',direction='desc',includeCompleted=false,busy=false,requestId=crypto.randomUUID();
let editing:{id:string;revision:number;value:string}|null=null;
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function append(parent:Node,...children:Node[]){for(const child of children)parent.appendChild(child);}
const date=(value:number)=>new Date(value).toLocaleDateString(undefined,{dateStyle:'medium'});
function controls(){
 root.querySelectorAll<HTMLButtonElement|HTMLInputElement>('button,input').forEach(e=>e.disabled=busy);
 get<HTMLButtonElement>('punch-prev').disabled=busy||offset===0;get<HTMLButtonElement>('punch-next').disabled=busy||!data.hasMore;
 get('punch-pages').hidden=offset===0&&!data.hasMore;
 get('punch-completed-toggle').setAttribute('aria-checked',String(includeCompleted));
 root.setAttribute('aria-busy',String(busy));
 for(const b of root.querySelectorAll<HTMLButtonElement>('[data-punch-sort]')){
  const selected=b.dataset.punchSort===sort;b.closest('th')!.setAttribute('aria-sort',selected?(direction==='asc'?'ascending':'descending'):'none');b.querySelector('span')!.textContent=selected?(direction==='asc'?'↑':'↓'):'↕';
 }
}
async function load(){
 const q=new URLSearchParams({sort,direction,includeCompleted:String(includeCompleted),offset:String(offset)});
 const response=await fetch('/api/owner/punch-list?'+q,{credentials:'same-origin',cache:'no-store'}),value=await response.json() as Data & {error?:string};
 if(!response.ok)throw Error(value.error||'Unable to load punch list.');
 data=value;document.querySelectorAll<HTMLElement>('[data-punch-open-count]').forEach(counter=>counter.textContent=String(data.openCount));if(!data.items.length&&offset>0){offset=Math.max(0,offset-50);return load();}render();
}
async function refresh(){if(busy)return;busy=true;controls();try{await load();notice.textContent='';}catch(e){notice.textContent=e instanceof Error?e.message:'Unable to load list.';}finally{busy=false;controls();}}
async function save(input:Record<string,unknown>,after?:()=>void){
 if(busy)return;busy=true;controls();notice.textContent='Saving…';let saved=false;
 try{await post('/api/owner/punch-list',input);saved=true;after?.();await load();notice.textContent='Saved.';}
 catch(e){notice.textContent=saved?'Saved, but the list could not refresh. Select Refresh list.':(e instanceof Error?e.message:'Unable to confirm this change.')+(editing?' Your edit has been kept; cancel it before refreshing to check another owner’s changes.':'');}
 finally{busy=false;controls();}
}
function icon(symbol:string,label:string,callback:()=>void){const b=el('button',symbol);b.type='button';b.className='punch-icon';b.setAttribute('aria-label',label);b.title=label;b.addEventListener('click',callback);return b;}
function render(){
 const rows=get('punch-items');rows.replaceChildren();
 for(const item of data.items){
  const tr=el('tr');if(item.completed_at!==null)tr.className='completed';
  const name=el('td');
  if(editing?.id===item.id){
   const draft=editing,form=el('form');form.className='punch-inline-edit';const input=el('input');input.value=draft.value;input.maxLength=120;input.required=true;input.setAttribute('aria-label','Edit item name');input.dataset.punchEdit=item.id;input.addEventListener('input',()=>{draft.value=input.value;});
   const submit=icon('✓','Save item name',()=>form.requestSubmit()),cancel=icon('×','Cancel editing',()=>{editing=null;render();focusEdit(item.id);});
   input.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();editing=null;render();focusEdit(item.id);}});
   form.addEventListener('submit',e=>{e.preventDefault();void save({action:'edit',id:item.id,revision:draft.revision,label:draft.value},()=>{editing=null;});});append(form,input,submit,cancel);append(name,form);
  }else{
   const wrapper=el('div');wrapper.className='punch-name-wrap';const edit=icon('✎','Edit '+item.label,()=>{if(editing){notice.textContent='Save or cancel your current edit first.';return;}editing={id:item.id,revision:item.revision,value:item.label};render();root.querySelector<HTMLInputElement>('[data-punch-edit]')?.focus();});edit.dataset.editItem=item.id;append(wrapper,edit,el('span',item.label));append(name,wrapper);
  }
  const status=el('td'),toggle=el('button',item.completed_at!==null?'✓':'●');toggle.type='button';toggle.className='punch-status '+(item.completed_at!==null?'is-completed':'is-open');toggle.setAttribute('aria-label',(item.completed_at!==null?'Reopen ':'Mark completed: ')+item.label);toggle.title=item.completed_at!==null?'Completed — reopen item':'Open — mark completed';toggle.addEventListener('click',()=>{if(editing){notice.textContent='Save or cancel your edit first.';return;}void save({action:item.completed_at!==null?'reopen':'complete',id:item.id,revision:item.revision});});append(status,toggle);
  const created=el('td');created.className='punch-date';append(created,el('time',date(item.created_at)),el('small','by '+item.creator_email));created.querySelector('time')!.dateTime=new Date(item.created_at).toISOString();
  const completed=el('td');completed.className='punch-date';if(item.completed_at!==null){append(completed,el('time',date(item.completed_at)),el('small','by '+item.completed_email));completed.querySelector('time')!.dateTime=new Date(item.completed_at).toISOString();}else completed.textContent='—';
  append(tr,status,name,created,completed);append(rows,tr);
 }
 if(!data.items.length){const row=el('tr'),cell=el('td',includeCompleted?'No items yet. Add your first item above.':'No open items. Add an item or include completed items.');cell.colSpan=4;append(row,cell);append(rows,row);}
 get('punch-count').textContent=data.items.length?`Items ${offset+1}–${offset+data.items.length} · Dates use your device’s time zone.`:'';controls();
}
function focusEdit(id:string){[...root.querySelectorAll<HTMLButtonElement>('[data-edit-item]')].find(b=>b.dataset.editItem===id)?.focus();}
function canNavigate(){if(busy)return false;if(editing){notice.textContent='Save or cancel your edit first.';return false;}return true;}
create.addEventListener('submit',e=>{e.preventDefault();if(!canNavigate())return;void save({action:'create',id:requestId,label:newName.value},()=>{newName.value='';requestId=crypto.randomUUID();offset=0;sort='created';direction='desc';});});
get('punch-refresh').addEventListener('click',()=>{if(canNavigate())void refresh();});
get('punch-completed-toggle').addEventListener('click',()=>{if(!canNavigate())return;includeCompleted=!includeCompleted;offset=0;void refresh();});
root.querySelectorAll<HTMLButtonElement>('[data-punch-sort]').forEach(b=>b.addEventListener('click',()=>{if(!canNavigate())return;const selected=b.dataset.punchSort as Sort;direction=selected===sort?(direction==='asc'?'desc':'asc'):(selected==='created'||selected==='completed'?'desc':'asc');sort=selected;offset=0;void refresh();}));
get('punch-prev').addEventListener('click',()=>{if(canNavigate()&&offset){offset-=50;void refresh();}});get('punch-next').addEventListener('click',()=>{if(canNavigate()&&data.hasMore){offset+=50;void refresh();}});
void refresh();
