import { dayKey, plusDays, weekday, ZONE } from './calendar.ts';
export type Period = { id:string; kind:'available'|'blocked'; local_day:string|null; weekday:number|null; start_minute:number; end_minute:number };
export type CalendarState = { revision:number; periods:Period[] };
export type Slot = { day:string; start:string; end:string; startsAt:number; endsAt:number };
export function validDay(value:unknown):value is string {
 return typeof value==='string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
}
export function validatePeriod(value:unknown):Omit<Period,'id'> {
 if(!value||typeof value!=='object')throw Error('Choose a valid period.');
 const p=value as Period;
 if(!['available','blocked'].includes(p.kind) || !Number.isInteger(p.start_minute) || !Number.isInteger(p.end_minute) || p.start_minute<0 || p.end_minute>1440 || p.start_minute>=p.end_minute || p.start_minute%15 || p.end_minute%15)throw Error('Use quarter-hour times with end after start. Split overnight ranges into two days.');
 if(!((validDay(p.local_day)&&p.weekday===null)||(p.local_day===null&&Number.isInteger(p.weekday)&&typeof p.weekday==='number'&&p.weekday>=-1&&p.weekday<=6)))throw Error('Choose a date or a recurring weekday.');
 return {kind:p.kind,local_day:p.local_day,weekday:p.weekday,start_minute:p.start_minute,end_minute:p.end_minute};
}
export function wallTime(minute:number):string {return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;}
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
// NY is UTC-5 or UTC-4 throughout the supported 2000–2099 date range.
// Return no instant for gaps or folds: never silently shift or pick a repeated time.
export function uniqueInstant(day:string,minute:number):number|null {
 if(minute===1440){day=plusDays(day,1);minute=0;}
 const wall=wallTime(minute), target=Date.parse(`${day}T${wall}:00Z`);
 const matches=[4,5].map(h=>target+h*3600000).filter(t=>{
  const p=formatter.formatToParts(t),v=(k:string)=>p.find(x=>x.type===k)!.value;
  return `${v('year')}-${v('month')}-${v('day')}`===day&&`${v('hour')}:${v('minute')}`===wall;
 });
 return matches.length===1?matches[0]:null;
}
export function availableSlots(periods:Period[],from:string,to:string,now=Date.now()):Slot[] {
 if(!validDay(from)||!validDay(to)||to<from||Date.parse(to)-Date.parse(from)>41*86400000)throw Error('Choose a date range of at most 42 days.');
 const slots:Slot[]=[];
 for(let day=from;day<=to;day=plusDays(day,1)){
  const applicable=periods.filter(p=>p.local_day===day||(p.local_day===null&&(p.weekday===-1||p.weekday===weekday(day))));
  const open=new Array<boolean>(96).fill(false),closed=new Array<boolean>(96).fill(false);
  for(const p of applicable)for(let n=p.start_minute/15;n<p.end_minute/15;n++)(p.kind==='available'?open:closed)[n]=true;
  // One-hour slots anchored to each clock hour, preserving the previous calendar's cadence.
  for(let m=0;m<=1380;m+=60){
   if(!open.slice(m/15,m/15+4).every(Boolean)||closed.slice(m/15,m/15+4).some(Boolean))continue;
   const points=Array.from({length:5},(_,i)=>uniqueInstant(day,m+i*15));
   if(points.some(t=>t===null)||points.some((t,i)=>i>0&&t! - points[i-1]! !==900000))continue;
   const startsAt=points[0]!,endsAt=points[4]!;
   if(startsAt<=now)continue;
   slots.push({day,start:wallTime(m),end:wallTime(m+60),startsAt,endsAt});
  }
 }
 return slots;
}
export function visitorWindow(from:unknown,to:unknown,now=Date.now()):{from:string;to:string} {
 const today=dayKey(now);
 if(!validDay(from)||!validDay(to)||from<today||to>plusDays(today,41)||to<from)throw Error('Choose dates within the next 42 days.');
 return {from,to};
}
