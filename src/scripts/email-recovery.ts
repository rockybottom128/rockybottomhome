import {recoveryLabel} from '../lib/email-recovery';
type Delivery={kind:'booking'|'report';id:string;recipient:string;subject:string;status:string;attempted_at:number|null;recovery_outcome:string|null;recovery_revision:number;canFlag:boolean;canReview:boolean};
const root=document.getElementById('email-recovery')!;
const q=<T=HTMLElement>(selector:string)=>root.querySelector(selector)! as unknown as T;
const list=q<HTMLUListElement>('[data-recovery-list]'),notice=q<HTMLParagraphElement>('[data-recovery-notice]'),form=q<HTMLFormElement>('[data-recovery-form]'),history=q<HTMLDivElement>('[data-recovery-history]');
const outcome=q<HTMLSelectElement>('[name=outcome]'),receipt=q<HTMLInputElement>('[name=provider_receipt]'),confirmed=q<HTMLInputElement>('[name=confirmed]'),evidence=q<HTMLTextAreaElement>('[name=evidence]');
const endpoint='/api/owner/email-recovery';
let selected:Delivery|null=null,pending:{signature:string;key:string}|null=null,busy=false;
function text<K extends keyof HTMLElementTagNameMap>(tag:K,value:string){const node=document.createElement(tag);node.textContent=value;return node;}
async function request<T=unknown>(path='',input?:Record<string,unknown>):Promise<T>{
 const r=await fetch(endpoint+path,input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{cache:'no-store'});
 const result=await r.json() as T & {error?:string};if(!r.ok){if(r.status===409)pending=null;throw Error(result.error??'Review unavailable.');}return result;
}
function fields(){
 q('[data-receipt-label]').hidden=outcome.value!=='accepted';receipt.required=outcome.value==='accepted';
 q('[data-confirm-label]').hidden=outcome.value==='unknown';confirmed.required=outcome.value!=='unknown';confirmed.checked=false;
}
outcome.addEventListener('change',fields);
async function select(row:Delivery){
 if(busy)return;selected=row;pending=null;form.reset();fields();form.hidden=!row.canReview;
 q('[data-recovery-selected]').textContent=`${row.recipient} · ${row.subject}`;
 history.replaceChildren(text('h3','Latest 20 review entries'));
 try{
  const value=await request<{history:Array<{outcome:string;created_at:number;reviewer:string;evidence:string;provider_receipt:string}>}>('?kind='+row.kind+'&id='+encodeURIComponent(row.id));if(selected!==row)return;
  const ul=document.createElement('ul');
  for(const entry of value.history)ul.appendChild(text('li',`${new Date(entry.created_at).toLocaleString()} · ${entry.reviewer} · ${entry.outcome==='flagged'?'Flagged uncertain':recoveryLabel(entry.outcome)} · ${entry.evidence}${entry.provider_receipt?' · Receipt: '+entry.provider_receipt:''}`));
  history.appendChild(ul);if(!value.history.length)history.appendChild(text('p','No reviews recorded yet.'));
 }catch(error){notice.textContent=(error as Error).message;}
}
async function save(row:Delivery,value:Record<string,unknown>){
 if(busy)return;
 const input={kind:row.kind,id:row.id,revision:row.recovery_revision,...value};
 const signature=JSON.stringify(input);if(pending?.signature!==signature)pending={signature,key:crypto.randomUUID()};
 busy=true;root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);notice.textContent='Saving review…';
 try{await request('',{...input,request_key:pending.key});location.reload();}
 catch(error){notice.textContent=(error as Error).message;busy=false;root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);}
}
async function refresh(){
 if(busy)return;notice.textContent='Loading review list…';
 try{
  const value=await request<{items:Delivery[];hasMore:boolean}>();list.replaceChildren();
  for(const row of value.items as Delivery[]){
   const li=text('li',`${row.recipient} · ${row.subject} · ${recoveryLabel(row.recovery_outcome)??(row.status==='sending'?'Sending or outcome unknown':'Outcome unknown')}${row.attempted_at?' · Attempted '+new Date(row.attempted_at).toLocaleString():''}`);
   if(row.canFlag){const b=text('button','Flag uncertain — no resend');b.type='button';b.className='text-button';b.onclick=()=>void save(row,{outcome:'flagged'});li.appendChild(document.createTextNode(' '));li.appendChild(b);}
   else if(row.status==='sending')li.appendChild(text('p',row.attempted_at?'Wait until 15 minutes after the attempt, then refresh.':'Attempt time unavailable — operator investigation required.'));
   const b=text('button',row.canReview?'Review / view history':'View review history');b.type='button';b.className='text-button';b.onclick=()=>void select(row);li.appendChild(document.createTextNode(' '));li.appendChild(b);list.appendChild(li);
  }
  notice.textContent=value.hasMore?'Showing 100 records, unresolved first. Recorded outcomes remain in history.':value.items.length?'Recorded outcomes remain in history. No resend is available.':'No uncertain or unfinished emails to review.';
 }catch(error){notice.textContent=(error as Error).message;}
}
form.addEventListener('submit',event=>{event.preventDefault();if(selected)void save(selected,{outcome:outcome.value,evidence:evidence.value,provider_receipt:receipt.value,confirmed:confirmed.checked});});
q<HTMLButtonElement>('[data-recovery-refresh]').onclick=()=>void refresh();
void refresh();
