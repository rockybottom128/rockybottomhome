import {reportModeNotice,reportDeliveryLabel,type ReportDeliveryMode} from '../lib/report-delivery';
import {post} from './auth-request';
type Item={id:string;label:string;creator_email:string;completed_email:string|null;created_at:number;completed_at:number|null;revision:number};
type Data={items:Item[];hasMore:boolean;openCount:number;bulkAvailable:boolean;reportsAvailable:boolean;setupMessage?:string;deliveryMode?:ReportDeliveryMode};
type Sort='name'|'status'|'created'|'completed';
const root=document.getElementById('punch-list')!;
const get=<T=HTMLElement>(id:string)=>document.getElementById(id) as unknown as T;
const bulk=get<HTMLInputElement>('punch-bulk'),labels=get<HTMLTextAreaElement>('punch-labels');
const duplicateChoice=get('punch-duplicate-choice'),allowDuplicates=get<HTMLInputElement>('punch-allow-duplicates');
const create=get<HTMLFormElement>('punch-create'),newName=get<HTMLInputElement>('punch-label'),notice=get('punch-result');
let data:Data={items:[],hasMore:false,openCount:0,bulkAvailable:false,reportsAvailable:false},offset=0,sort:Sort='created',direction='desc',includeCompleted=false,busy=false,requestId=crypto.randomUUID();
let editing:{id:string;revision:number;value:string}|null=null;
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function append(parent:Node,...children:Node[]){for(const child of children)parent.appendChild(child);}
const date=(value:number)=>new Date(value).toLocaleDateString(undefined,{dateStyle:'medium'});
function controls(){
 root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('#punch-content button,#punch-content input,#punch-content textarea').forEach(e=>{if(!e.closest('dialog'))e.disabled=busy;});
 newName.disabled=busy||bulk.checked;newName.required=!bulk.checked;labels.disabled=busy||!bulk.checked;labels.required=bulk.checked;
 get<HTMLButtonElement>('punch-add').disabled=busy||(bulk.checked&&!data.bulkAvailable);
 get<HTMLButtonElement>('report-prepare').disabled=reportBusy||!data.reportsAvailable;
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
 data=value;get('report-mail-mode').textContent=reportModeNotice(data.deliveryMode??'unavailable');get('report-send').textContent=data.deliveryMode==='test'?'Save local test report (no email)':'Send report';const setup=get('punch-setup');setup.hidden=data.bulkAvailable&&data.reportsAvailable;setup.textContent=setup.hidden?'':data.setupMessage||'New punch-list features are not available yet. Single-item entry still works.';const reportSetup=get('report-setup');reportSetup.hidden=data.reportsAvailable;reportSetup.textContent=data.reportsAvailable?'':data.setupMessage||'Email reports are not available yet.';document.querySelectorAll<HTMLElement>('[data-punch-open-count]').forEach(counter=>counter.textContent=String(data.openCount));if(!data.items.length&&offset>0){offset=Math.max(0,offset-50);return load();}render();
}
async function refresh(){if(busy)return;busy=true;controls();try{await load();notice.textContent='';}catch(e){notice.textContent=e instanceof Error?e.message:'Unable to load list.';}finally{busy=false;controls();}}
async function save(input:Record<string,unknown>,after?:()=>void){
 if(busy)return;busy=true;controls();notice.textContent='Saving…';const feedback=get('punch-create-result');const creating=input.action==='create'||input.action==='bulk-create';if(creating)feedback.textContent='Saving…';let saved=false;
 try{await post('/api/owner/punch-list',input);saved=true;after?.();await load();notice.textContent='Saved.';if(creating)feedback.textContent='Items saved.';}
 catch(e){if(e instanceof Error&&'code' in e&&e.code==='PUNCH_DUPLICATES')duplicateChoice.hidden=false;notice.textContent=saved?'Saved, but the list could not refresh. Select Refresh list.':(e instanceof Error?e.message:'Unable to confirm this change.')+(editing?' Your edit has been kept; cancel it before refreshing to check another owner’s changes.':'');}
 finally{busy=false;controls();if(creating&&!saved){feedback.textContent=notice.textContent+' Your entry is still in the box.';feedback.focus();feedback.scrollIntoView({block:'center',behavior:'smooth'});}}
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
create.addEventListener('submit',e=>{e.preventDefault();if(!canNavigate())return;if(bulk.checked&&!data.bulkAvailable){get('punch-create-result').textContent=data.setupMessage||'Bulk adding is not available yet.';get('punch-create-result').focus();return;}void save({action:bulk.checked?'bulk-create':'create',id:requestId,label:newName.value,labels:labels.value,allowDuplicates:allowDuplicates.checked},()=>{newName.value='';labels.value='';allowDuplicates.checked=false;duplicateChoice.hidden=true;requestId=crypto.randomUUID();offset=0;sort='created';direction='desc';});});
get('punch-refresh').addEventListener('click',()=>{if(canNavigate())void refresh();});
get('punch-completed-toggle').addEventListener('click',()=>{if(!canNavigate())return;includeCompleted=!includeCompleted;offset=0;void refresh();});
root.querySelectorAll<HTMLButtonElement>('[data-punch-sort]').forEach(b=>b.addEventListener('click',()=>{if(!canNavigate())return;const selected=b.dataset.punchSort as Sort;direction=selected===sort?(direction==='asc'?'desc':'asc'):(selected==='created'||selected==='completed'?'desc':'asc');sort=selected;offset=0;void refresh();}));
get('punch-prev').addEventListener('click',()=>{if(canNavigate()&&offset){offset-=50;void refresh();}});get('punch-next').addEventListener('click',()=>{if(canNavigate()&&data.hasMore){offset+=50;void refresh();}});
labels.addEventListener('input',()=>{allowDuplicates.checked=false;});
bulk.addEventListener('change',()=>{duplicateChoice.hidden=true;allowDuplicates.checked=false;newName.hidden=bulk.checked;labels.hidden=!bulk.checked;get('punch-bulk-hint').hidden=!bulk.checked;get('punch-add').textContent=bulk.checked?'Add items':'Add item';controls();(bulk.checked?labels:newName).focus();});
function showPunch(open:boolean){get('punch-content').hidden=!open;const toggle=get('punch-visibility-toggle');toggle.setAttribute('aria-checked',String(open));toggle.setAttribute('aria-expanded',String(open));get('punch-visibility-label').textContent=open?'Hide punch list':'Show punch list';}
get('punch-visibility-toggle').addEventListener('click',()=>showPunch(get('punch-content').hidden));
function revealPunch(){if(location.hash==='#punch-list')showPunch(true);}
window.addEventListener('hashchange',revealPunch);revealPunch();
document.querySelectorAll<HTMLAnchorElement>('a[href="#punch-list"]').forEach(a=>a.addEventListener('click',()=>{showPunch(true);}));
const dialog=get<HTMLDialogElement>('punch-report-dialog'),reportForm=get<HTMLFormElement>('punch-report-form');
let reportRequest=crypto.randomUUID(),reportId:string|null=null,reportBusy=false;
async function reportCall(input:Record<string,unknown>){const r=await fetch('/api/owner/punch-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const value=await r.json() as {error?:string;id:string;preview:string;recipients:{recipient:string;include_attribution:number;status:string;localTest:boolean}[];deliveryMode:ReportDeliveryMode};if(!r.ok)throw Error(value.error||'Report unavailable.');return value;}
function reportControls(){dialog.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLTextAreaElement>('button,input,textarea').forEach(e=>e.disabled=reportBusy);get<HTMLButtonElement>('report-prepare').disabled=reportBusy||!data.reportsAvailable;}
get('punch-email').addEventListener('click',()=>{if(canNavigate())dialog.showModal();});
get('report-close').addEventListener('click',()=>dialog.close());
get('report-new').addEventListener('click',()=>{reportId=null;reportRequest=crypto.randomUUID();reportForm.hidden=false;get('report-review').hidden=true;get('report-result').textContent='';});
reportForm.addEventListener('submit',async e=>{e.preventDefault();if(reportBusy)return;if(!data.reportsAvailable){get('report-result').textContent=data.setupMessage||'Email reports are not available yet.';get('report-result').focus();return;}reportBusy=true;reportControls();get('report-result').textContent='Preparing snapshot…';try{
 const value=await reportCall({action:'prepare',id:reportRequest,sort,direction,includeCompleted,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,owners:[...dialog.querySelectorAll<HTMLInputElement>('input[name="report-owner"]:checked')].map(e=>e.value),custom:get<HTMLTextAreaElement>('report-custom').value});
 reportId=value.id;data.deliveryMode=value.deliveryMode;get('report-mail-mode').textContent=reportModeNotice(value.deliveryMode);get('report-send').textContent=value.deliveryMode==='test'?'Save local test report (no email)':'Send report';get('report-preview').textContent=value.preview;get('report-recipients').textContent=value.recipients.map((r:{recipient:string;include_attribution:number})=>r.recipient+(r.include_attribution?' (with owner attribution)':' (without owner attribution)')).join('; ');reportForm.hidden=true;get('report-review').hidden=false;get('report-result').textContent=value.deliveryMode==='test'?'Review recipients and snapshot before saving this local test. No email will be sent.':'Review recipients and snapshot before sending real email.';
 }catch(e){get('report-result').textContent=e instanceof Error?e.message:'Unable to prepare report.';get('report-result').focus();get('report-result').scrollIntoView({block:'center'});}finally{reportBusy=false;reportControls();}});
get('report-send').addEventListener('click',async()=>{if(reportBusy||!reportId)return;reportBusy=true;reportControls();get('report-result').textContent=data.deliveryMode==='test'?'Saving locally — no email will be sent…':'Sending to email provider…';try{const v=await reportCall({action:'send',id:reportId,deliveryMode:data.deliveryMode});get('report-result').textContent=v.recipients.map((r:{recipient:string;status:string;localTest:boolean;recovery_outcome?:string|null})=>r.recipient+': '+reportDeliveryLabel(r.status,Boolean(r.localTest),r.recovery_outcome)).join('; ');window.dispatchEvent(new Event('punch-report-sent'));}catch(e){get('report-result').textContent=e instanceof Error?e.message:'Unable to confirm send. Check history before trying again.';}finally{reportBusy=false;reportControls();}});

void refresh();
