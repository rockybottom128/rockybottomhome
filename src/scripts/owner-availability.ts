import { dayKey, monthDays, timeRange } from '../lib/viewings/calendar';
import { validatePeriod, validDay, wallTime, type CalendarState, type Period, type Slot } from '../lib/viewings/availability';
import { el, label, drawCalendar, makeButton } from './viewing-sample-store';
let day=dayKey(),month=day.slice(0,7),state:CalendarState|null=null,slots:Slot[]=[],pending=false,editing:string|null=null,generation=0;
const value=(id:string)=>(el(id) as HTMLInputElement|HTMLSelectElement).value;
const set=(id:string,v:string)=>{(el(id) as HTMLInputElement|HTMLSelectElement).value=v;};
function scopeFields(){
 const weekly=value('rule-scope')==='weekly';
 el<HTMLInputElement>('rule-date').disabled=weekly||pending;
 (el('rule-weekday') as unknown as HTMLSelectElement).disabled=!weekly||pending;
}
function status(text:string){el('availability-result').textContent=text;}
function lock(){
 scopeFields();
 el('availability-app').setAttribute('aria-busy',String(pending));
 document.querySelectorAll<HTMLButtonElement>('[data-mutation]').forEach(b=>b.disabled=pending||!state);
 el<HTMLButtonElement>('reload-calendar').disabled=pending;
 el('owner-calendar').querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=pending);
 for(const id of ['previous-month','next-month','today-month','owner-month','cancel-edit']) (el(id) as HTMLButtonElement|HTMLInputElement).disabled=pending;
}
async function load(message='Shared calendar loaded.'){
 const own=++generation;pending=true;lock();status('Loading calendar…');
 try{
  const r=await fetch(`/api/owner/availability?day=${day}`,{credentials:'same-origin',cache:'no-store'}),data=await r.json() as CalendarState & {slots:Slot[];error?:string};
  if(!r.ok)throw Error(data.error||'Unable to load calendar.');
  if(own!==generation)return;
  state=data;slots=data.slots;render();status(message);
 }catch(error){if(own!==generation)return;state=null;slots=[];render();status(error instanceof Error?error.message:'Unable to load calendar.');}
 finally{if(own===generation){pending=false;lock();}}
}
async function change(action:string,id?:string,period?:Omit<Period,'id'>){
 if(pending||!state)return;
 pending=true;lock();status('Saving…');
 try{
  const r=await fetch('/api/owner/availability',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:state.revision,action,id,period})}),data=await r.json() as {error?:string};
  if(!r.ok)throw Error(data.error||'Save could not be confirmed. Reload before retrying.');
  clearEdit();await load('Saved to the shared calendar.');
 }catch(error){state=null;status(error instanceof Error?error.message:'Save could not be confirmed. Reload before retrying.');}
 finally{pending=false;lock();}
}
function clearEdit(){editing=null;scopeFields();set('rule-date',day);el('period-heading').textContent='Add a time range.';el('save-period').textContent='Save period';el('rule-error').textContent='';}
function render(){
 set('owner-month',month);if(!editing)set('rule-date',day);el('owner-selected-day').textContent=label(day);
 drawCalendar(el('owner-calendar'),monthDays(month),day,d=>{if(pending||!validDay(d))return;day=d;month=d.slice(0,7);clearEdit();void load();},()=>pending);
 const whole=state?.periods.find(p=>p.kind==='blocked'&&p.local_day===day&&p.start_minute===0&&p.end_minute===1440);
 el('toggle-day').textContent=whole?'Remove entire-day block':'Block entire day';
 el('day-state').textContent=!state?'Calendar unavailable. Reload before editing.':whole?'Entire day blocked':`${slots.length} future one-hour slot(s) available.`;
 const tiles=el('owner-slots');tiles.replaceChildren();
 for(const slot of slots){const b=makeButton(`${timeRange(slot.start,slot.end)} · Block`,()=>{void change('add',undefined,{kind:'blocked',local_day:day,weekday:null,start_minute:Number(slot.start.slice(0,2))*60,end_minute:Number(slot.end.slice(0,2))*60});});b.dataset.mutation='';tiles.appendChild(b);}
 const list=el('rule-list');list.replaceChildren();
 for(const p of state?.periods??[]){
  const row=document.createElement('li');row.textContent=`${p.kind==='available'?'Available':'Blocked'} · ${p.local_day??(p.weekday===-1?'Every day':`Every ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][p.weekday!]}`)} · ${timeRange(wallTime(p.start_minute),wallTime(p.end_minute))} `;
  const edit=makeButton('Edit',()=>{if(pending)return;editing=p.id;set('rule-kind',p.kind);set('rule-date',p.local_day??day);set('rule-scope',p.local_day?'date':'weekly');set('rule-weekday',String(p.weekday??-1));set('rule-start',wallTime(p.start_minute));set('rule-end',wallTime(p.end_minute));el('period-heading').textContent=`Edit ${p.local_day??'weekly range'}`;el('save-period').textContent='Save changes';scopeFields();el('rule-kind').focus();},'text-button');edit.dataset.mutation='';
  const remove=makeButton('Remove',()=>{void change('remove',p.id);},'text-button');remove.dataset.mutation='';const actions=document.createElement('span');actions.className='period-actions';actions.appendChild(edit);actions.appendChild(document.createTextNode(' '));actions.appendChild(remove);row.appendChild(actions);list.appendChild(row);
 }
 if(state&&!state.periods.length)list.textContent='No periods configured. Visitors have no available slots.';
 lock();
}
el('rule-form').addEventListener('submit',e=>{
 e.preventDefault();if(pending||!state)return;
 const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
 try{const period=validatePeriod({kind:value('rule-kind'),local_day:value('rule-scope')==='date'?value('rule-date'):null,weekday:value('rule-scope')==='weekly'?Number(value('rule-weekday')):null,start_minute:minutes(value('rule-start')),end_minute:minutes(value('rule-end'))});void change(editing?'update':'add',editing??undefined,period);}
 catch(error){el('rule-error').textContent=(error as Error).message;}
});
el('toggle-day').addEventListener('click',()=>{const whole=state?.periods.find(p=>p.kind==='blocked'&&p.local_day===day&&p.start_minute===0&&p.end_minute===1440);void change(whole?'remove':'add',whole?.id,{kind:'blocked',local_day:day,weekday:null,start_minute:0,end_minute:1440});});
function navigate(m:string){if(pending||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))return;month=m;day=m+'-01';clearEdit();void load();}
function move(delta:number){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);navigate(d.toISOString().slice(0,7));}
el('previous-month').addEventListener('click',()=>move(-1));el('next-month').addEventListener('click',()=>move(1));el('owner-month').addEventListener('change',()=>navigate(value('owner-month')));
el('today-month').addEventListener('click',()=>{if(pending)return;day=dayKey();month=day.slice(0,7);clearEdit();void load();});
el('cancel-edit').addEventListener('click',clearEdit);el('reload-calendar').addEventListener('click',()=>{clearEdit();void load();});
el('rule-scope').addEventListener('change',scopeFields);
void load();
