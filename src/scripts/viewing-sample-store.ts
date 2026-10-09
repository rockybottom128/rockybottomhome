import { dayKey, plusDays, easternTime, ruleBlocks, type BlockRule } from '../lib/viewings/calendar';
export type SampleBooking = { id:string; day:string; time:string; end:string; start:number; mode:'agent_private'|'owner_coordinated'; status:'requested'|'approved'|'completed'|'canceled'; visitorId:string; source:string; access:'none'|'pending'|'ready'|'revoked'; revision:number; feedback:string[]; reason?:string };
export type SampleState = { profile: {id:string; role:string; verified:boolean}|null; bookings:SampleBooking[]; blockedDays:string[]; blockedSlots:string[]; openSlots:string[]; rules:BlockRule[]; notices:string[] };
const KEY='rb-viewings-sample-v2';
export const TIMES=Array.from({length:8},(_,i)=>({start:`${String(i+9).padStart(2,'0')}:00`,end:`${String(i+10).padStart(2,'0')}:00`}));
export function readSample():SampleState {
  try { const value=localStorage.getItem(KEY); if(value) return JSON.parse(value); } catch { /* Preview storage may be unavailable. */ }
  const today=dayKey(); const past=plusDays(today,-2), future=plusDays(today,2);
  return {profile:null,bookings:[
    {id:'sample-past',day:past,time:'10:00',end:'11:00',start:easternTime(past,'10:00'),mode:'agent_private',status:'completed',visitorId:'sample-visitor',source:'mls',access:'none',revision:1,feedback:[]},
    {id:'sample-upcoming',day:future,time:'10:00',end:'11:00',start:easternTime(future,'10:00'),mode:'agent_private',status:'approved',visitorId:'sample-visitor',source:'mls',access:'ready',revision:1,feedback:[]}
  ],blockedDays:[],blockedSlots:[],openSlots:[],rules:[],notices:[]};
}
export function saveSample(state:SampleState) { localStorage.setItem(KEY,JSON.stringify(state)); }
export function sampleSignedIn() { return Number(sessionStorage.getItem('rb-sample-session')||0)>Date.now(); }
export function blocked(state:SampleState,day:string,start:string,end:string) {
  const key=day+' '+start;
  return state.blockedDays.includes(day) || state.blockedSlots.includes(key) || (!state.openSlots.includes(key)&&ruleBlocks(day,start,end,state.rules));
}
export function reserved(state:SampleState,day:string,time:string) { return state.bookings.some(b=>b.day===day&&b.time===time&&['requested','approved'].includes(b.status)); }
export function label(day:string,time?:string) { return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',month:'short',day:'numeric',year:'numeric',...(time?{hour:'numeric',minute:'2-digit',hour12:true}:{})}).format(easternTime(day,time||'12:00')); }
export function el<T extends HTMLElement=HTMLElement>(id:string):T { return document.getElementById(id) as T; }
export function makeButton(text:string,fn:()=>void,className='slot') { const b=document.createElement('button'); b.type='button'; b.className=className; b.textContent=text; b.addEventListener('click',fn); return b; }
export function drawCalendar(container:HTMLElement,days:string[],selected:string,onSelect:(d:string)=>void,disabled:(d:string)=>boolean) {
  container.replaceChildren();
  for(const name of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']) { const h=document.createElement('span'); h.className='weekday'; h.textContent=name;container.appendChild(h); }
  for(const day of days) { const b=makeButton(String(Number(day.slice(8))),()=>onSelect(day),'calendar-day');b.disabled=disabled(day);b.setAttribute('aria-label',label(day));b.setAttribute('aria-pressed',String(day===selected));if(day===dayKey())b.setAttribute('aria-current','date');container.appendChild(b); }
}
