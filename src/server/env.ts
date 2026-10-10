export type AppEnv = {
  DB: D1Database;
  APP_ORIGIN: string;
  AUTH_ENABLED: string;
  AUTH_SECRET: string;
  OTP_SECRET: string;
  MAIL_MODE: 'resend' | 'test';
  RESEND_API_KEY?: string;
  MAIL_REPLY_TO?: string;
  MAIL_FROM?: string;
  MAIL_ALLOWED_RECIPIENTS?: string;
  VISITOR_EMAIL_DOMAINS?: string;
  BOOTSTRAP_TOKEN?: string;
  BOOTSTRAP_OWNER_EMAIL?: string;
};
export function configured(env: Partial<AppEnv>, request: Request): env is AppEnv {
  return env.AUTH_ENABLED === 'true' && !!env.DB && (env.AUTH_SECRET?.length ?? 0) >= 32
    && (env.OTP_SECRET?.length ?? 0) >= 32 && !env.AUTH_SECRET?.startsWith('replace-') && !env.OTP_SECRET?.startsWith('replace-') && env.APP_ORIGIN === new URL(request.url).origin;
}
export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)) throw new Error('Enter a valid email address.');
  return email;
}
export const noStore = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
export function json(value: unknown, status = 200, extra: Record<string,string> = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...noStore, 'Content-Type': 'application/json', ...extra } });
}
export async function body(request: Request, env: AppEnv): Promise<Record<string,unknown>> {
  if (request.method !== 'POST' || request.headers.get('origin') !== env.APP_ORIGIN
    || !request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Invalid request.');
  return readJson(request);
}

export async function readJson(request: Pick<Request, 'body'>): Promise<Record<string,unknown>> {
  const reader=request.body?.getReader();
  if(!reader)throw new Error('Invalid request.');
  const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();throw new Error('Request too large.');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const parsed=JSON.parse(new TextDecoder().decode(bytes));
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Invalid request.');
  return parsed;
}
