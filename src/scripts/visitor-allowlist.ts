import type {AllowlistEntry} from '../server/visitor-allowlist';
const root=document.getElementById('visitor-allowlist')!,lists=document.getElementById('allowlist-lists')!,form=document.getElementById('allowlist-form') as HTMLFormElement,result=document.getElementById('allowlist-result')!;
const kind=form.elements.namedItem('kind') as unknown as HTMLInputElement,value=form.elements.namedItem('value') as HTMLInputElement;
let revision=0,entries:AllowlistEntry[]=[],editing:string|null=null,busy=false,needsReload=false;
function lock(locked:boolean){busy=locked;root.querySelectorAll('button,input,select').forEach(e=>(e as unknown as {disabled:boolean}).disabled=locked);}
function button(text:string,action:()=>void){const b=document.createElement('button');b.type='button';b.className='text-button';b.textContent=text;b.addEventListener('click',action);return b;}
function edit(type:string,entry?:AllowlistEntry){if(busy||needsReload)return;editing=entry?.id??null;kind.value=type;value.value=entry?.value??'';form.hidden=false;document.getElementById('allowlist-form-title')!.textContent=entry?'Edit entry':'Add entry';value.focus();}
function render(){
 lists.replaceChildren();
 for(const type of ['domain','email']){
  const section=document.createElement('div'),heading=document.createElement('h3'),ul=document.createElement('ul');heading.textContent=type==='domain'?'Allowed domains':'Individual emails';ul.className='allowlist-values';
  for(const entry of entries.filter(e=>e.kind===type)){
   const li=document.createElement('li'),text=document.createElement('span'),actions=document.createElement('span');text.textContent=entry.value;actions.className='period-actions';
   actions.appendChild(button('Edit',()=>edit(type,entry)));actions.appendChild(button('Remove',()=>{if(confirm(`Remove ${entry.value}? Visitor access will require another matching entry. Existing bookings will not be canceled.`))void save({action:'remove',id:entry.id});}));li.appendChild(text);li.appendChild(actions);ul.appendChild(li);
  }
  if(!ul.children.length){const li=document.createElement('li');li.textContent='None configured.';ul.appendChild(li);}
  section.appendChild(heading);section.appendChild(ul);section.appendChild(button(type==='domain'?'Add domain':'Add individual email',()=>edit(type)));lists.appendChild(section);
 }
}
async function load(){
 if(busy)return;lock(true);
 try{const r=await fetch('/api/owner/visitor-allowlist',{credentials:'same-origin'}),data=await r.json() as {revision:number;entries:AllowlistEntry[];error?:string};if(!r.ok)throw Error(data.error||'Unable to load list.');revision=data.revision;entries=data.entries;needsReload=false;form.hidden=true;render();result.textContent='Saved list loaded.';}catch(e){needsReload=true;result.textContent=(e as Error).message;}finally{lock(false);}
}
async function save(change:Record<string,unknown>){
 if(busy||needsReload)return;lock(true);result.textContent='Saving…';let validationError=false;
 try{const r=await fetch('/api/owner/visitor-allowlist',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...change,revision})}),data=await r.json() as {revision:number;entries:AllowlistEntry[];error?:string};if(!r.ok){validationError=r.status===400;throw Error(data.error||'Unable to confirm change. Reload the list.');}revision=data.revision;entries=data.entries;form.hidden=true;render();result.textContent='Saved.';}catch(e){result.textContent=(e as Error).message; if(!validationError)needsReload=true;}finally{lock(false);}
}
form.addEventListener('submit',e=>{e.preventDefault();void save({action:editing?'update':'add',id:editing,kind:kind.value,value:value.value});});
document.getElementById('allowlist-edit-cancel')!.addEventListener('click',()=>{form.hidden=true;editing=null;});
document.getElementById('allowlist-reload')!.addEventListener('click',()=>void load());
void load();
