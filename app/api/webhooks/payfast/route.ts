import { sha256 } from '@/lib/crypto';
import { parseItn, verifyItnSignature, verifyPayfastServer, verifySourceIp } from '@/lib/payfast';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dispatchOutboundEvent, queueMerchantEvent } from '@/lib/webhooks';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:Request){
  const raw=await req.text(); const entries=parseItn(raw); const values=Object.fromEntries(entries); const db=supabaseAdmin();
  const eventHash=sha256(raw);
  const {error:dedupeError}=await db.from('mp_webhook_events').insert({provider:'payfast',event_hash:eventHash,payload:values});
  if(dedupeError && dedupeError.code==='23505'){
    const {data:existing}=await db.from('mp_webhook_events').select('processed_at,valid').eq('event_hash',eventHash).maybeSingle();
    if(existing?.processed_at) return new Response('OK',{status:200});
  } else if(dedupeError) return new Response('storage error',{status:500});
  const paymentId=values.m_payment_id;
  if(!paymentId){await db.from('mp_webhook_events').update({valid:false,error:'missing m_payment_id'}).eq('event_hash',eventHash);return new Response('OK',{status:200});}
  const {data:payment,error:paymentError}=await db.from('mp_payments').select('id,merchant_id,amount_cents,status').eq('id',paymentId).maybeSingle();
  if(paymentError) return new Response('database error',{status:500});
  if(!payment){await db.from('mp_webhook_events').update({valid:false,error:'unknown payment',processed_at:new Date().toISOString()}).eq('event_hash',eventHash);return new Response('OK',{status:200});}
  const expectedMerchant=process.env.PAYFAST_MERCHANT_ID || '';
  const amountMatches=Number(values.amount_gross).toFixed(2)===(payment.amount_cents/100).toFixed(2);
  const merchantMatches=values.merchant_id===expectedMerchant;
  const [signatureOk,sourceOk,serverOk]=await Promise.all([Promise.resolve(verifyItnSignature(entries)),verifySourceIp(req),verifyPayfastServer(entries)]);
  const valid=signatureOk && sourceOk && serverOk && amountMatches && merchantMatches;
  if(!valid){await db.from('mp_webhook_events').update({valid:false,error:JSON.stringify({signatureOk,sourceOk,serverOk,amountMatches,merchantMatches})}).eq('event_hash',eventHash);return new Response('OK',{status:200});}
  const providerStatus=values.payment_status==='COMPLETE'?'paid':values.payment_status==='FAILED'?'failed':'pending';
  const status=payment.status==='paid'?'paid':providerStatus;
  const update={status,provider_payment_id:values.pf_payment_id||null,provider_payload:values,updated_at:new Date().toISOString(),...(status==='paid'&&payment.status!=='paid'?{paid_at:new Date().toISOString()}:{})};
  const {data:updated,error:updateError}=await db.from('mp_payments').update(update).eq('id',payment.id).select('id,merchant_id,status,amount_cents,currency,external_reference,provider_payment_id,paid_at').single();
  if(updateError || !updated) return new Response('database error',{status:500});
  try {
    const eventId=await queueMerchantEvent(updated.merchant_id,`payment.${updated.status}`,updated,`payfast:${eventHash}`);
    await dispatchOutboundEvent(eventId);
  } catch {
    return new Response('webhook queue error',{status:500});
  }
  await db.from('mp_webhook_events').update({valid:true,processed_at:new Date().toISOString(),error:null}).eq('event_hash',eventHash);
  return new Response('OK',{status:200});
}
