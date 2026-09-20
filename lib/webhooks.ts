import { hmacSha256 } from './crypto';
import { supabaseAdmin } from './supabase-admin';

export async function queueMerchantEvent(merchantId: string, eventType: string, payload: unknown, dedupeKey?: string) {
  const db = supabaseAdmin();
  const row = {merchant_id:merchantId,event_type:eventType,payload,dedupe_key:dedupeKey||null};
  const { data, error } = await db.from('mp_outbound_events').insert(row).select('id').single();
  if (!error && data) return data.id as string;
  if (error?.code === '23505' && dedupeKey) {
    const {data:existing, error:lookupError}=await db.from('mp_outbound_events').select('id').eq('merchant_id',merchantId).eq('dedupe_key',dedupeKey).single();
    if (!lookupError && existing) return existing.id as string;
  }
  throw error || new Error('Unable to queue outbound event');
}

export async function dispatchOutboundEvent(eventId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data: event, error } = await db.from('mp_outbound_events')
    .select('id, merchant_id, event_type, payload, attempts, merchants(webhook_url, webhook_secret)')
    .eq('id', eventId).single();
  if (error || !event) return false;
  const merchant = Array.isArray(event.merchants) ? event.merchants[0] : event.merchants;
  if (!merchant?.webhook_url || !merchant?.webhook_secret) {
    await db.from('mp_outbound_events').update({status:'skipped',last_error:'No merchant webhook configured'}).eq('id',eventId);
    return true;
  }
  const body = JSON.stringify({id:event.id,type:event.event_type,created_at:new Date().toISOString(),data:event.payload});
  const signature = hmacSha256(merchant.webhook_secret, body);
  try {
    const res = await fetch(merchant.webhook_url, {method:'POST',headers:{'content-type':'application/json','x-mobicom-signature':`sha256=${signature}`,'x-mobicom-event':event.event_type},body,cache:'no-store'});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await db.from('mp_outbound_events').update({status:'delivered',attempts:(event.attempts||0)+1,delivered_at:new Date().toISOString(),last_error:null}).eq('id',eventId);
    return true;
  } catch (e) {
    const attempts=(event.attempts||0)+1;
    const delayMinutes=Math.min(60,2**Math.min(attempts,5));
    const next=new Date(Date.now()+delayMinutes*60_000).toISOString();
    await db.from('mp_outbound_events').update({status:'pending',attempts,next_attempt_at:next,last_error:e instanceof Error?e.message:String(e)}).eq('id',eventId);
    return false;
  }
}
