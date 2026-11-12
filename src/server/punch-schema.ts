import type {AppEnv} from './env.ts';
export const punchSetupMessage='Bulk adding and email reports are unavailable until the database update is approved and applied. No items were added and no email was sent.';
export class PunchSetupRequired extends Error {constructor(){super(punchSetupMessage);}}
export async function punchCapabilities(env:AppEnv){
 const rows=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('punch_batches','punch_reports','punch_report_deliveries')").all<{name:string}>();
 const names=new Set(rows.results.map(r=>r.name));
 return {bulkAvailable:names.has('punch_batches'),reportsAvailable:names.has('punch_reports')&&names.has('punch_report_deliveries')};
}
export async function requirePunchSetup(env:AppEnv,feature:'bulk'|'reports'){
 const capabilities=await punchCapabilities(env);
 if(!(feature==='bulk'?capabilities.bulkAvailable:capabilities.reportsAvailable))throw new PunchSetupRequired();
}
