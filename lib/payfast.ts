import { resolve4 } from 'node:dns/promises';
import { boolEnv, requiredEnv } from './env';
import { phpUrlEncode, orderedSignature, itnParamString, itnSignature } from './payfast-core.mjs';

export type CheckoutPayment = {
  id: string;
  amount_cents: number;
  description: string;
  customer_email?: string | null;
  external_reference?: string | null;
  return_url?: string | null;
  cancel_url?: string | null;
};

const LIVE_HOST = 'www.payfast.co.za';
const SANDBOX_HOST = 'sandbox.payfast.co.za';
const VALID_HOSTS = ['www.payfast.co.za','w1w.payfast.co.za','w2w.payfast.co.za','sandbox.payfast.co.za'];
let cachedIps: { expires: number; ips: Set<string> } | null = null;

export { phpUrlEncode, orderedSignature, itnParamString };

export function payfastHost(): string {
  return boolEnv('PAYFAST_SANDBOX', true) ? SANDBOX_HOST : LIVE_HOST;
}

export function buildCheckout(payment: CheckoutPayment) {
  const appUrl = requiredEnv('APP_URL').replace(/\/$/, '');
  const entries: Array<[string,string]> = [
    ['merchant_id', requiredEnv('PAYFAST_MERCHANT_ID')],
    ['merchant_key', requiredEnv('PAYFAST_MERCHANT_KEY')],
    ['return_url', payment.return_url || `${appUrl}/checkout/${payment.id}?result=return`],
    ['cancel_url', payment.cancel_url || `${appUrl}/checkout/${payment.id}?result=cancel`],
    ['notify_url', `${appUrl}/api/webhooks/payfast`],
    ['email_address', payment.customer_email || ''],
    ['m_payment_id', payment.id],
    ['amount', (payment.amount_cents / 100).toFixed(2)],
    ['item_name', payment.description.slice(0,100)],
    ['item_description', (payment.external_reference || '').slice(0,255)],
  ];
  const signature = orderedSignature(entries, process.env.PAYFAST_PASSPHRASE || null);
  return {
    action: `https://${payfastHost()}/eng/process`,
    fields: [...entries.filter(([,v]) => v !== ''), ['signature', signature]] as Array<[string,string]>,
  };
}

export function parseItn(rawBody: string): Array<[string,string]> {
  const params = new URLSearchParams(rawBody);
  return Array.from(params.entries());
}

export function verifyItnSignature(entries: Array<[string,string]>): boolean {
  const signature = entries.find(([k]) => k === 'signature')?.[1] || '';
  const expected = itnSignature(entries, process.env.PAYFAST_PASSPHRASE || null);
  return signature !== '' && signature === expected;
}

export async function verifyPayfastServer(entries: Array<[string,string]>): Promise<boolean> {
  const body = itnParamString(entries);
  const res = await fetch(`https://${payfastHost()}/eng/query/validate`, {
    method: 'POST',
    headers: {'content-type':'application/x-www-form-urlencoded'},
    body,
    cache: 'no-store',
  });
  return res.ok && (await res.text()).trim() === 'VALID';
}

async function validPayfastIps(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedIps && cachedIps.expires > now) return cachedIps.ips;
  const all = new Set<string>();
  for (const host of VALID_HOSTS) {
    try { for (const ip of await resolve4(host)) all.add(ip); } catch { /* continue */ }
  }
  cachedIps = { expires: now + 5 * 60_000, ips: all };
  return all;
}

export async function verifySourceIp(req: Request): Promise<boolean> {
  if (boolEnv('PAYFAST_SKIP_IP_CHECK', false)) return true;
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const direct = req.headers.get('x-real-ip')?.trim();
  const source = forwarded || direct;
  if (!source) return false;
  const ips = await validPayfastIps();
  return ips.has(source);
}
