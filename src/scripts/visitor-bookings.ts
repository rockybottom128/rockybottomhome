import { timeLabel, timeRange, feedbackAllowed } from '../lib/viewings/calendar';
import { readSample, saveSample, sampleSignedIn, label, el, makeButton } from './viewing-sample-store';
let selected='';
function render(){const state=readSample(),signed=sampleSignedIn();el('visitor-signin-needed').hidden=signed;el('visitor-bookings').hidden=!signed;if(!signed)return;
 const bookings=state.bookings.filter(b=>b.visitorId===state.profile?.id).sort((a,b)=>b.start-a.start);const list=el('visitor-booking-list');list.replaceChildren();
 for(const b of bookings){const button=makeButton(`${label(b.day,b.time)} · ${b.status}`,()=>{selected=b.id;el('visitor-booking-result').textContent='';render();});button.setAttribute('aria-pressed',String(selected===b.id));list.appendChild(button);}if(!bookings.length)list.textContent='No bookings yet. Request your first viewing.';
 const booking=bookings.find(b=>b.id===selected);if(!booking)return;
 el('booking-title').textContent=label(booking.day,booking.time);el('booking-state').textContent=`${timeRange(booking.time,booking.end)} Eastern · ${booking.status}`;
 el('booking-next').textContent=booking.status==='canceled'?`Canceled. ${booking.reason||''}`:booking.status==='requested'?'Request received. Awaiting approval; no visit or access is confirmed yet.':booking.mode==='owner_coordinated'?'Owner-coordinated viewing. Follow the owner’s confirmation instructions; no keybox PIN is issued.':booking.access==='pending'?'Viewing approved. Timed access setup is still pending; wait for access instructions.':booking.access==='ready'?'Sample timed access is ready. Live instructions will be emailed after the PIN is confirmed installed. It works only during the approved time slot.':'This viewing has ended.';
 const canFeedback=feedbackAllowed(booking.start,booking.status);el('followup-section').hidden=!canFeedback;el('followup-wait').textContent=booking.status==='approved'&&!canFeedback?'Questions and feedback open when this viewing starts.':'';
 el('cancel-selected').hidden=!['approved','requested'].includes(booking.status)||booking.start<=Date.now();const messages=el('booking-feedback');messages.replaceChildren();for(const text of booking.feedback){const li=document.createElement('li');li.textContent=text;messages.appendChild(li);}
}
el('sample-send').addEventListener('click',()=>{const s=readSample(),b=s.bookings.find(x=>x.id===selected&&x.visitorId===s.profile?.id);if(!sampleSignedIn()||!b||!feedbackAllowed(b.start,b.status))return;b.feedback.push(el<HTMLTextAreaElement>('sample-message').value);saveSample(s);render();el('visitor-booking-result').textContent='Sample feedback saved for this viewing in this browser. Nothing was emailed.';});
el('cancel-selected').addEventListener('click',()=>{const s=readSample(),b=s.bookings.find(x=>x.id===selected&&x.visitorId===s.profile?.id);if(!sampleSignedIn()||!b||b.start<=Date.now()||!['approved','requested'].includes(b.status))return;b.status='canceled';b.revision++;b.access=b.access==='none'?'none':'revoked';saveSample(s);render();});
el('visitor-signout').addEventListener('click',()=>{sessionStorage.removeItem('rb-sample-session');render();});
setInterval(render,30000);render();
