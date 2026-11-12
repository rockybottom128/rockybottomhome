import { limit } from './rate-limit';
import { normalizeEmail, type AppEnv } from './env';
export {allowedVisitorEmail as visitorRecipientAllowed} from './visitor-allowlist';
import {allowedVisitorEmail as visitorRecipientAllowed} from './visitor-allowlist';
/** Callers authorize recipients and build subjects; owner messages allow bounded text. Never log provider payloads or credentials. */
export class MailDeliveryUncertain extends Error { readonly uncertain=true; }
// Independent per-database, fixed 24-hour budgets total 100. Public reset requests
// cannot spend the invitation reserve. Only trusted server callers choose a purpose.
const dailyBudgets={visitor:60,booking:20,owner:5,'owner-reset':5,report:10} as const;
type MailPurpose=keyof typeof dailyBudgets;
export async function sendMail(env: AppEnv, to: string, subject: string, text: string, purpose: MailPurpose = 'visitor', deliveryKey?:string, html?:string): Promise<string> {
  to=normalizeEmail(to);
  if(!Object.hasOwn(dailyBudgets,purpose))throw new Error('Invalid mail purpose');
  if (/[\r\n]/.test(subject)) throw new Error('Invalid email subject');
  if(purpose==='owner'||purpose==='owner-reset') {
    // Owner invitations/reset mail may use any domain, but only for an existing,
    // active or invited owner. The public visitor API cannot select this purpose.
    const owner=await env.DB.prepare("SELECT id FROM owner_accounts WHERE email_normalized=? AND status IN ('active','invited')").bind(to).first();
    if(!owner)throw new Error('Owner recipient is not authorized');
  } else if(purpose==='report') {
    const authorized=await env.DB.prepare(`SELECT d.id FROM punch_report_deliveries d JOIN punch_reports r ON r.id=d.report_id JOIN owner_accounts o ON o.id=r.actor_id WHERE d.id=? AND d.recipient=? AND d.status='sending' AND o.status='active'`).bind(deliveryKey??'',to).first();
    if(!authorized)throw new Error('Report recipient is not authorized');
  } else if(!await visitorRecipientAllowed(env,to)) {
    throw new Error('This email is not enabled for visitor testing.');
  }
  if(env.MAIL_MODE==='test') {
    if (!['127.0.0.1','localhost'].includes(new URL(env.APP_ORIGIN).hostname)) throw new Error('Test delivery is local only');
  } else if (env.MAIL_MODE !== 'resend' || !env.RESEND_API_KEY?.startsWith('re_')
    || env.MAIL_FROM !== 'bookings@notify.rockybottomhome.com'
    || env.MAIL_REPLY_TO !== 'bookings@rockybottomhome.com') {
    console.warn('Mail configuration rejected');
    throw new Error('Email delivery is not configured');
  }
  // Reject recipient bursts before charging the shared purpose budget. A visitor
  // request for an owner's address must not consume their owner-mail allowance.
  await limit(env,`mail-recipient:${purpose}:${to}`,purpose==='owner-reset'?3:10,3600000);
  await limit(env,'mail-budget:'+purpose,dailyBudgets[purpose],86400000);
  if(env.MAIL_MODE==='test') {
    await env.DB.prepare('INSERT INTO local_test_mail(id,recipient,subject,body,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),to,subject,text,Date.now()).run();
    return 'local-test';
  }
  let providerStatus: number | undefined;
  try {
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': deliveryKey ?? crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: `Rocky Bottom <${env.MAIL_FROM}>`,
        reply_to: env.MAIL_REPLY_TO,
        to: [to],
        subject,
        text,
        ...(html ? {html} : {}),
      }),
    });
    providerStatus = sent.status;
    if (!sent.ok) throw new Error('Provider rejected the message');
    const result = await sent.json() as { id?: unknown };
    if (typeof result.id !== 'string' || !result.id) throw new Error('Missing message receipt');
    return result.id;
  } catch {
    // Never expose provider responses, credentials or request contents.
    // A timeout may follow acceptance: don't retry or enable the OTP challenge.
    console.warn('Mail delivery failed', providerStatus ?? 'transport');
    throw new MailDeliveryUncertain('Email delivery unavailable');
  }
}
