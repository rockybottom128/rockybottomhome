export const ZONE = 'America/New_York';
export function dayKey(now = Date.now()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${p.find(x=>x.type==='year')!.value}-${p.find(x=>x.type==='month')!.value}-${p.find(x=>x.type==='day')!.value}`;
}
export function plusDays(day: string, n: number): string { return new Date(Date.parse(day+'T12:00:00Z') + n*86400000).toISOString().slice(0,10); }
export function weekday(day: string): number { return new Date(day+'T12:00:00Z').getUTCDay(); }
export function visitorDays(today: string): string[] {
  const wd = weekday(today), start = plusDays(today,-wd), count = wd >= 4 ? 35 : 28;
  return Array.from({length:count},(_,i)=>plusDays(start,i));
}
export function monthDays(month: string): string[] {
  const first = month+'-01'; const count = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)),0).getDate();
  return Array.from({length:Math.ceil((weekday(first)+count)/7)*7},(_,i)=>plusDays(first,i-weekday(first)));
}
export function easternTime(day: string, time: string): number {
  const target = Date.parse(`${day}T${time}:00Z`); let candidate = target;
  for(let i=0;i<3;i++) {
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(candidate);
    const v=(t:string)=>p.find(x=>x.type===t)!.value;
    const represented=Date.parse(`${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}:${v('second')}Z`);
    candidate += target-represented;
  }
  return candidate;
}
export type BlockRule = { id: string; weekday: number; start: string; end: string };
export function ruleBlocks(day: string, start: string, end: string, rules: BlockRule[]): boolean {
  return rules.some(r=>(r.weekday===-1 || r.weekday===weekday(day)) && r.start<end && r.end>start);
}
export function feedbackAllowed(start: number, status: string, now = Date.now()): boolean {
  return Number.isFinite(start) && now>=start && (status==='approved' || status==='completed');
}
export function cancellationAllowed(affected: number, reason: string, notify: boolean): boolean {
  return affected===0 || (reason.trim().length>=5 && notify);
}
export function challengeValid(code: string, entered: string, expires: number, attempts: number, consumed: boolean, now: number): boolean {
  return /^\d{8}$/.test(entered) && entered===code && now<expires && attempts<5 && !consumed;
}

/** Display stored 24-hour wall times consistently, regardless of browser locale. */
export function timeLabel(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour % 24 < 12 ? 'AM' : 'PM'}${hour === 24 ? ' (next day)' : ''}`;
}
export function timeRange(start: string, end: string): string {
  return `${timeLabel(start)}–${timeLabel(end)}`;
}
