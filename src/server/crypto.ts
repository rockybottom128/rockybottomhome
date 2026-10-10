export function token(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b=>b.toString(16).padStart(2,'0')).join(''); }
export function code(): string {
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= 4200000000);
  return String(random[0] % 100000000).padStart(8,'0');
}
export async function digest(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const result = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), b=>b.toString(16).padStart(2,'0')).join('');
}
export function equal(a: string, b: string): boolean {
  let result = a.length ^ b.length;
  for (let i=0;i<Math.max(a.length,b.length);i++) result |= (a.charCodeAt(i)||0) ^ (b.charCodeAt(i)||0);
  return result === 0;
}
