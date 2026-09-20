import { authenticateMerchant } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requiredEnv } from '@/lib/env';

export const runtime = 'nodejs';

type CreatePaymentBody = {
  amount_cents?: number;
  currency?: string;
  description?: string;
  external_reference?: string;
  customer_email?: string;
  return_url?: string;
  cancel_url?: string;
  metadata?: Record<string, unknown>;
};

function validHttpUrl(value?: string) {
  if (!value) return true;
  try { const u=new URL(value); return u.protocol==='https:' || u.protocol==='http:'; } catch { return false; }
}

export async function POST(req: Request) {
  const auth = await authenticateMerchant(req);
  if (!auth) return Response.json({error:'unauthorized'}, {status:401});
  let body: CreatePaymentBody;
  try { body=await req.json(); } catch { return Response.json({error:'invalid_json'}, {status:400}); }
  if (!Number.isInteger(body.amount_cents) || (body.amount_cents as number) < 500) return Response.json({error:'amount_cents must be an integer of at least 500 (R5.00)'},{status:400});
  if ((body.currency || 'ZAR') !== 'ZAR') return Response.json({error:'v0.2 supports ZAR only'},{status:400});
  if (!body.description || body.description.trim().length < 2) return Response.json({error:'description is required'},{status:400});
  if (!validHttpUrl(body.return_url) || !validHttpUrl(body.cancel_url)) return Response.json({error:'return_url and cancel_url must be http(s) URLs'},{status:400});
  const idem=req.headers.get('idempotency-key')?.slice(0,128) || null;
  const db=supabaseAdmin(); const appUrl=requiredEnv('APP_URL').replace(/\/$/,'');
  if (idem) {
    const {data:existing}=await db.from('mp_payments').select('id,status,amount_cents,currency,external_reference,created_at').eq('merchant_id',auth.merchantId).eq('idempotency_key',idem).maybeSingle();
    if (existing) return Response.json({...existing,checkout_url:`${appUrl}/checkout/${existing.id}`},{status:200});
  }
  const payload={merchant_id:auth.merchantId,amount_cents:body.amount_cents,currency:'ZAR',description:body.description.trim().slice(0,100),external_reference:body.external_reference?.slice(0,150)||null,customer_email:body.customer_email?.slice(0,150)||null,return_url:body.return_url||null,cancel_url:body.cancel_url||null,metadata:body.metadata||{},idempotency_key:idem,provider:'payfast',status:'pending'};
  const {data,error}=await db.from('mp_payments').insert(payload).select('id,status,amount_cents,currency,external_reference,created_at').single();
  if (error) return Response.json({error:'payment_create_failed',detail:error.message},{status:500});
  return Response.json({...data,checkout_url:`${appUrl}/checkout/${data.id}`},{status:201});
}
