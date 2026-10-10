import type {Slot} from '../lib/viewings/availability';
import {post} from './auth-request';
import { timeLabel, timeRange, dayKey, visitorDays, challengeValid } from '../lib/viewings/calendar';
import { readSample, saveSample, label, el, makeButton, drawCalendar } from './viewing-sample-store';
const root=document.querySelector<HTMLElement>('#intake');
if(root) {
 const verifiedDemo=root.dataset.verifiedDemo==='true';
 async function demoAllowed(){
  if(!verifiedDemo)return true;
  try{await post('/api/visitor/demo-access',{});return true;}
  catch{root!.hidden=true;location.assign('/viewings/');return false;}
 }
 if(verifiedDemo){
  el('email-form').hidden=true;
  el('intake-form').hidden=false;
  el('intake-title').textContent='Simulate identity verification.';
  sessionStorage.setItem('rb-sample-session',String(Date.now()+3600000));
  setInterval(()=>{void demoAllowed();},15000);
 }
 const role=document.getElementById('visitor-role') as unknown as HTMLSelectElement;
 const form=el<HTMLFormElement>('intake-form'), step=el('slot-step'), request=el<HTMLButtonElement>('request-sample');
 const attending=el<HTMLInputElement>('agent-attending'); let day='',time='',end='',code='',expires=0,attempts=0,consumed=false;
 function sendCode() {
  // Preview only. Production generation, hashing, delivery and checks must all be server-side.
  const data=new Uint32Array(1); do { crypto.getRandomValues(data); } while(data[0]>=4200000000);
  const previous=code; code=String(data[0]%100000000).padStart(8,'0');if(code===previous)code=String((Number(code)+1)%100000000).padStart(8,'0');
  expires=Date.now()+10*60000;attempts=0;consumed=false;
  const state=readSample();state.profile ||= {id:'sample-visitor',role:'',verified:false};saveSample(state);
  el('email-form').hidden=true;el('code-form').hidden=false;
  el('code-sent').textContent='Check your email and enter the latest code. In this preview no email is sent; use the sample code below. A resend replaces the previous code.';
  el('sample-code').textContent=`Sample inbox: ${code} · expires in 10 minutes`;
  el('code-result').textContent='';el<HTMLInputElement>('email-code').value='';el('email-code').focus();
 }
 el('email-form').addEventListener('submit',e=>{e.preventDefault();sendCode();});el('resend-code').addEventListener('click',sendCode);
 el('code-form').addEventListener('submit',e=>{
  e.preventDefault();const entered=el<HTMLInputElement>('email-code').value;
  if(!challengeValid(code,entered,expires,attempts,consumed,Date.now())){attempts++;el('code-result').textContent=attempts>=5?'Too many attempts. Request a new sample code.':'Invalid or expired code. Use the latest code or resend.';return;}
  consumed=true;sessionStorage.setItem('rb-sample-session',String(Date.now()+3600000));el('code-form').hidden=true;
  if(new URLSearchParams(location.search).get('next')==='bookings'){location.assign('/viewings/status');return;}
  const profile=readSample().profile;if(profile?.verified){role.value=profile.role;updateRole();showSlots();}else{el('intake-title').textContent='Tell us about your visit.';form.hidden=false;role.focus();}
 });
 function updateRole(){const agent=role.value==='agent';el('agent-fields').hidden=!agent;el('verification-explanation').textContent=agent?'Sample license and registration business-email checks will be treated as successful. In the live service unresolved checks go to owners; verified agents can skip Stripe.':'Stripe will require government ID and a matching selfie. We retain the result and private reference selfie for 90 days, not copies of ID images. This preview simulates success without contacting Stripe.';}
 role.addEventListener('change',updateRole);updateRole();
 function updateButton(){request.disabled=loading||confirming||!time||(role.value==='agent'&&!attending.checked);el('booking-review').hidden=true;}
 attending.addEventListener('change',updateButton);
 function showSlots(){el('intake-title').textContent='Choose your viewing.';form.hidden=true;step.hidden=false;const agent=role.value==='agent';el('attending-wrap').hidden=!agent;el('verification-badge').textContent=agent?'Sample agent credentials verified · Stripe waived':'Sample Stripe ID + selfie verified · owner-coordinated visit';day=dayKey();time='';renderCalendar();void renderSlots();}
 form.addEventListener('submit',async e=>{e.preventDefault();if(!await demoAllowed())return;const state=readSample();state.profile={id:'sample-visitor',role:role.value,verified:true};saveSample(state);showSlots();});
 function renderCalendar(){const days=visitorDays(dayKey());el('calendar-heading').textContent=`Rolling ${days.length/7}-week availability`;el('calendar-range').textContent=`${label(days[0])} – ${label(days.at(-1)!)} · Sunday–Saturday`;drawCalendar(el('visitor-calendar'),days,day,d=>{if(confirming)return;day=d;time='';renderCalendar();renderSlots();updateButton();},d=>d<dayKey());}
 let slots:Slot[]=[],loading=false,slotGeneration=0,confirming=false;
 async function fetchSlots(selectedDay:string):Promise<Slot[]> {
  const response=await fetch(`/api/visitor/availability?from=${selectedDay}&to=${selectedDay}`,{credentials:'same-origin',cache:'no-store'});
  const data=await response.json() as {slots:Slot[];error?:string};
  if(!response.ok)throw Error(data.error||'Unable to load availability.');
  return data.slots;
 }
 async function renderSlots(){
  const own=++slotGeneration;slots=[];loading=true;updateButton();el('slot-list').replaceChildren();el('selected-day').textContent=label(day);el('slot-empty').textContent='Loading shared availability…';
  try{const loaded=await fetchSlots(day);if(own!==slotGeneration)return;slots=loaded;
   if(!slots.some(s=>s.start===time&&s.end===end))time='';
   for(const t of slots){const b=makeButton(timeRange(t.start,t.end),()=>{time=t.start;end=t.end;drawSlots();updateButton();});b.setAttribute('aria-pressed',String(time===t.start));el('slot-list').appendChild(b);}
   el('slot-empty').textContent=slots.length?'':'No available times on this day. Please choose another date.';
  }catch(error){if(own!==slotGeneration)return;time='';el('slot-empty').textContent=(error as Error).message;const retry=makeButton('Retry availability',()=>{void renderSlots();});el('slot-list').appendChild(retry);}
  finally{if(own===slotGeneration){loading=false;updateButton();}}
 }
 function drawSlots(){for(const b of el('slot-list').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.textContent===timeRange(time,end)));}
 request.addEventListener('click',()=>{if(loading||confirming||!time)return;el('booking-review').hidden=false;el('review-summary').textContent=`Simulated selection: ${label(day,time)}–${timeLabel(end)} Eastern. No reservation, approval, email, or access code will be created.`;});
 el('confirm-booking').addEventListener('click',async()=>{
  if(confirming||loading||!time)return;
  confirming=true;const button=el<HTMLButtonElement>('confirm-booking');button.disabled=true;
  const selected={day,time,end};
  try{
   if(!await demoAllowed())return;
   const latest=await fetchSlots(selected.day);
   const slot=latest.find(s=>s.start===selected.time&&s.end===selected.end);
   const state=readSample();
   if(!slot||!state.profile?.verified||(role.value==='agent'&&!attending.checked))throw Error('This time is no longer available. Choose another time.');
   state.bookings.push({id:crypto.randomUUID(),day:selected.day,time:selected.time,end:selected.end,start:slot.startsAt,mode:role.value==='agent'?'agent_private':'owner_coordinated',status:'requested',visitorId:state.profile.id,source:root!.dataset.source||'public',access:'none',revision:1,feedback:[]});saveSample(state);
   el('request-result').textContent=`Simulated request saved in this browser: ${label(selected.day,selected.time)}. No time is reserved, no real request was submitted, and no email or access code was sent.`;
   el('request-result').focus();el('manage-bookings').hidden=false;
  }catch(error){el('request-result').textContent=(error as Error).message;}
  finally{confirming=false;button.disabled=false;time='';updateButton();if(day)void renderSlots();}
 });
 el('restart').addEventListener('click',()=>{el('intake-title').textContent='Tell us about your visit.';form.hidden=false;step.hidden=true;time='';attending.checked=false;updateButton();role.focus();});
}
