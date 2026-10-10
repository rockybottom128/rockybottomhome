import { limit } from './rate-limit';
import { normalizeEmail, type AppEnv } from './env';
/** No caller-controlled subject/body endpoint. Never log provider payloads or credentials. */
export async function sendMail(env: AppEnv, to: string, subject: string, text: string): Promise<void> {
  normalizeEmail(to);
  if (/[\r\n]/.test(subject)) throw new Error('Invalid email subject');
  const allowed = (env.MAIL_ALLOWED_RECIPIENTS ?? '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  // Development must use an explicit recipient allowlist. Empty means no delivery.
  if (!allowed.includes(to)) throw new Error('Recipient not enabled for development delivery');
  await limit(env,'mail-global',100,86400000);
  await limit(env,'mail-recipient:'+to,10,3600000);
  if (env.MAIL_MODE === 'test') {
    if (!['127.0.0.1','localhost'].includes(new URL(env.APP_ORIGIN).hostname)) throw new Error('Test delivery is local only');
    await env.DB.prepare('INSERT INTO local_test_mail(id,recipient,subject,body,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),to,subject,text,Date.now()).run();
    return;
  }
  if (env.MAIL_MODE !== 'resend' || !env.RESEND_API_KEY?.startsWith('re_')
    || env.MAIL_FROM !== 'bookings@notify.rockybottomhome.com'
    || env.MAIL_REPLY_TO !== 'bookings@rockybottomhome.com') {
    console.warn('Mail configuration rejected');
    throw new Error('Email delivery is not configured');
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
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        from: `Rocky Bottom <${env.MAIL_FROM}>`,
        reply_to: env.MAIL_REPLY_TO,
        to: [to],
        subject,
        text,
      }),
    });
    providerStatus = sent.status;
    if (!sent.ok) throw new Error('Provider rejected the message');
    const result = await sent.json() as { id?: unknown };
    if (typeof result.id !== 'string' || !result.id) throw new Error('Missing message receipt');
  } catch {
    // Never expose provider responses, credentials or request contents.
    // A timeout may follow acceptance: don't retry or enable the OTP challenge.
    console.warn('Mail delivery failed', providerStatus ?? 'transport');
    throw new Error('Email delivery unavailable');
  }
}
