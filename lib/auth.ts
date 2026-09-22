import { sha256 } from './crypto';
import { supabaseAdmin } from './supabase-admin';

export type MerchantAuth = { merchantId: string; merchantName: string };

export async function authenticateMerchant(req: Request): Promise<MerchantAuth | null> {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const raw = header.slice(7).trim();
  if (!raw.startsWith('mp_')) return null;
  const hash = sha256(raw);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('mp_api_keys')
    .select('id, merchant_id, merchants:mp_merchants(name, active)')
    .eq('key_hash', hash)
    .eq('active', true)
    .maybeSingle();
  if (error || !data) return null;
  const merchant = Array.isArray(data.merchants) ? data.merchants[0] : data.merchants;
  if (!merchant || merchant.active !== true) return null;
  void db.from('mp_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return { merchantId: data.merchant_id, merchantName: merchant.name };
}
