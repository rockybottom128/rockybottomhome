import type {Slot} from '../lib/viewings/availability';
import type {VisitorProfile} from '../server/visitor-profile';
import {timeRange,dayKey,visitorDays} from '../lib/viewings/calendar';
import {label,el,makeButton,drawCalendar} from './viewing-sample-store';
const root=el('intake');
const field=(id:string)=>el<HTMLInputElement>(id);
let profile:VisitorProfile|null=null,profileRevision=0,day=dayKey(),selected:Slot|null=null,requestKey='',loading=false,saving=false,submitting=false,generation=0;
async function api(path:string,data?:Record<string,unknown>){
 const r=await fetch(path,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',...(data?{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
 const result=await r.json() as {error?:string;profile?:VisitorProfile|null;slots?:Slot[];id?:string;status?:string};
 if(!r.ok){if(r.status===401||r.status===403){location.assign('/viewings/');}throw Error(result.error||'Unable to complete this request.');}
 return result;
}
function updateRole(){const agent=field('visitor-role').value==='agent';el('agent-fields').hidden=!agent;for(const id of ['agent-name','license-state','license-number','brokerage']){field(id).required=agent;field(id).disabled=!agent;}}
function buttons(){el<HTMLButtonElement>('review-request').disabled=loading||submitting||!selected||(profile?.role==='agent'&&!field('agent-attending').checked);el<HTMLButtonElement>('confirm-booking').disabled=submitting;el<HTMLButtonElement>('restart').disabled=submitting;}
async function loadProfile(){
 if(saving)return;saving=true;el<HTMLFieldSetElement>('profile-fields').disabled=true;el<HTMLButtonElement>('reload-profile').disabled=true;
 try{
  const data=await api('/api/visitor/profile');profile=data.profile??null;profileRevision=profile?.revision??0;
  if(profile){field('visitor-name').value=profile.display_name;field('visitor-role').value=profile.role;field('agent-name').value=profile.licensed_name;field('license-state').value=profile.jurisdiction;field('license-number').value=profile.license_number;field('brokerage').value=profile.brokerage;}
  updateRole();el('profile-result').textContent=profile?'Saved details loaded. Review them before continuing.':'Enter your details to continue.';el<HTMLFieldSetElement>('profile-fields').disabled=false;
 }catch(e){el('profile-result').textContent=(e as Error).message;}finally{saving=false;el<HTMLButtonElement>('reload-profile').disabled=false;}
}
field('visitor-role').addEventListener('change',updateRole);
el('reload-profile').addEventListener('click',()=>void loadProfile());
el('intake-form').addEventListener('submit',async e=>{
 e.preventDefault();if(saving)return;saving=true;el<HTMLFieldSetElement>('profile-fields').disabled=true;el('profile-result').textContent='Saving…';
 try{
  const result=await api('/api/visitor/profile',{revision:profileRevision,role:field('visitor-role').value,display_name:field('visitor-name').value,licensed_name:field('agent-name').value,jurisdiction:field('license-state').value,license_number:field('license-number').value,brokerage:field('brokerage').value});
  profile=result.profile!;profileRevision=profile.revision;el('intake-form').hidden=true;el('slot-step').hidden=false;el('intake-title').textContent='Request a viewing.';el('verification-badge').textContent='Email verified · '+(profile.role==='agent'?'Agent validation: simulated pass':'Identity validation: simulated pass');el('attending-wrap').hidden=profile.role!=='agent';day=dayKey();selected=null;draw();void loadSlots();
 }catch(error){el('profile-result').textContent=(error as Error).message;}finally{saving=false;el<HTMLFieldSetElement>('profile-fields').disabled=false;}
});
function draw(){const days=visitorDays(dayKey());el('calendar-heading').textContent=`Rolling ${days.length/7}-week availability`;el('calendar-range').textContent=`${label(days[0])} – ${label(days.at(-1)!)} · Eastern Time`;drawCalendar(el('visitor-calendar'),days,day,d=>{if(submitting)return;day=d;selected=null;requestKey='';el('booking-review').hidden=true;draw();void loadSlots();},d=>d<dayKey());}
async function loadSlots(){
 const own=++generation;loading=true;selected=null;buttons();el('booking-review').hidden=true;el('selected-day').textContent=label(day);el('slot-list').replaceChildren();el('slot-empty').textContent='Loading shared availability…';
 try{const data=await api(`/api/visitor/availability?from=${day}&to=${day}`);if(own!==generation)return;
  for(const slot of data.slots??[]){const b=makeButton(timeRange(slot.start,slot.end),()=>{if(submitting)return;selected=slot;requestKey=crypto.randomUUID();el('booking-review').hidden=true;el('slot-list').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));buttons();});b.setAttribute('aria-pressed','false');el('slot-list').appendChild(b);}
  el('slot-empty').textContent=data.slots?.length?'':'No available times on this day.';
 }catch(error){if(own!==generation)return;el('slot-empty').textContent=(error as Error).message;el('slot-list').appendChild(makeButton('Retry availability',()=>void loadSlots()));}
 finally{if(own===generation){loading=false;buttons();}}
}
field('agent-attending').addEventListener('change',()=>{el('booking-review').hidden=true;buttons();});
el('review-request').addEventListener('click',()=>{if(!selected||loading||submitting)return;el('booking-review').hidden=false;el('review-summary').textContent=`${label(selected.day)} · ${timeRange(selected.start,selected.end)} Eastern. Submit to hold this time pending owner approval. Identity and agent checks are simulated. Approval and cancellation updates will be emailed. No access code is issued; check My requests for the saved status.`;});
el('confirm-booking').addEventListener('click',async()=>{
 if(submitting||!selected)return;submitting=true;buttons();el('request-result').textContent='Submitting request…';
 try{
  const saved=await api('/api/visitor/bookings',{action:'request',day:selected.day,time:selected.start,request_key:requestKey,agent_attending:field('agent-attending').checked,source:root.dataset.source});
  el('request-result').textContent=saved.status==='requested'?'Request saved. This time is held pending owner approval. View My requests for the current status; your visit is not yet approved.':`This request is already saved with status: ${saved.status}. View My requests for details.`;el('request-result').focus();el('booking-review').hidden=true;selected=null;void loadSlots();
 }catch(error){el('request-result').textContent=(error as Error).message+' Check My requests before retrying. A retry of this selection will not create a duplicate.';}
 finally{submitting=false;buttons();}
});
el('restart').addEventListener('click',()=>{if(submitting)return;el('slot-step').hidden=true;el('intake-form').hidden=false;el('intake-title').textContent='Review your details.';selected=null;void loadProfile();});
setInterval(()=>{void api('/api/visitor/demo-access',{}).catch(()=>{});},15000);
void loadProfile();
