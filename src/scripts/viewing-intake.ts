import { timeLabel, timeRange, dayKey, visitorDays, easternTime, challengeValid } from '../lib/viewings/calendar';
import { readSample, saveSample, TIMES, blocked, reserved, label, el, makeButton, drawCalendar } from './viewing-sample-store';
const root=document.querySelector<HTMLElement>('#intake');
if(root) {
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
 function updateButton(){request.disabled=!time||(role.value==='agent'&&!attending.checked);el('booking-review').hidden=true;}
 attending.addEventListener('change',updateButton);
 function showSlots(){el('intake-title').textContent='Choose your viewing.';form.hidden=true;step.hidden=false;const agent=role.value==='agent';el('attending-wrap').hidden=!agent;el('verification-badge').textContent=agent?'Sample agent credentials verified · Stripe waived':'Sample Stripe ID + selfie verified · owner-coordinated visit';renderCalendar();}
 form.addEventListener('submit',e=>{e.preventDefault();const state=readSample();state.profile={id:'sample-visitor',role:role.value,verified:true};saveSample(state);showSlots();});
 function renderCalendar(){const days=visitorDays(dayKey());el('calendar-heading').textContent=`Rolling ${days.length/7}-week availability`;el('calendar-range').textContent=`${label(days[0])} – ${label(days.at(-1)!)} · Sunday–Saturday`;drawCalendar(el('visitor-calendar'),days,day,d=>{day=d;time='';renderCalendar();renderSlots();updateButton();},d=>d<dayKey());}
 function renderSlots(){const state=readSample(),list=el('slot-list');list.replaceChildren();el('selected-day').textContent=label(day);let count=0;
  for(const t of TIMES){const unavailable=blocked(state,day,t.start,t.end)||reserved(state,day,t.start)||easternTime(day,t.start)<=Date.now();const b=makeButton(`${timeRange(t.start,t.end)}${unavailable?' · unavailable':''}`,()=>{time=t.start;end=t.end;renderSlots();updateButton();});b.disabled=unavailable;b.setAttribute('aria-pressed',String(time===t.start));list.appendChild(b);if(!unavailable)count++;}
  el('slot-empty').textContent=count?'':'No available times on this day. Please choose another date.';
 }
 request.addEventListener('click',()=>{el('booking-review').hidden=false;el('review-summary').textContent=`${label(day,time)}–${timeLabel(end)} Eastern. ${role.value==='agent'?'Private agent showing. Submit for approval; after approval and confirmed timed-PIN setup, access instructions can be emailed immediately. The PIN works only during the approved window.':'Owner-coordinated visit. Owners must confirm arrangements. You will receive the time and instructions, without a keybox PIN.'}`;});
 el('confirm-booking').addEventListener('click',()=>{
  const state=readSample();if(!time||!state.profile?.verified||Number(sessionStorage.getItem('rb-sample-session'))<=Date.now()|| (role.value==='agent'&&!attending.checked)||blocked(state,day,time,end)||reserved(state,day,time)||easternTime(day,time)<=Date.now()){el('request-result').textContent='This selection is no longer available, or sign-in expired. Please sign in and select an available time.';return;}
  const id=crypto.randomUUID();state.bookings.push({id,day,time,end,start:easternTime(day,time),mode:role.value==='agent'?'agent_private':'owner_coordinated',status:'requested',visitorId:state.profile.id,source:root!.dataset.source||'public',access:'none',revision:1,feedback:[]});saveSample(state);
  el('request-result').textContent=`Sample request saved: ${label(day,time)}. Awaiting approval — this is not yet a confirmed viewing. Track approval and access readiness in My bookings. No real email or lock command was sent.`;el('request-result').focus();el('manage-bookings').hidden=false;el('booking-review').hidden=true;time='';updateButton();renderSlots();
 });
 el('restart').addEventListener('click',()=>{el('intake-title').textContent='Tell us about your visit.';form.hidden=false;step.hidden=true;time='';attending.checked=false;updateButton();role.focus();});
}
