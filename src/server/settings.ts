import type {AppEnv} from './env';
export async function visitorDemoEnabled(env:AppEnv):Promise<boolean> {
 const setting=await env.DB.prepare("SELECT value FROM site_settings WHERE key='visitor_demo'").first<{value:string}>();
 return setting?.value==='on';
}
export async function setVisitorDemo(env:AppEnv,ownerId:string,enabled:boolean) {
 const now=Date.now();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO site_settings(key,value,updated_at,updated_by) VALUES ('visitor_demo',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(enabled?'on':'off',now,ownerId),
  env.DB.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),ownerId,enabled?'visitor_demo_enabled':'visitor_demo_disabled','visitor_demo',now),
 ]);
}
