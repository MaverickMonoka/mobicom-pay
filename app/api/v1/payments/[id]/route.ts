import { authenticateMerchant } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const runtime='nodejs';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const auth=await authenticateMerchant(req); if(!auth) return Response.json({error:'unauthorized'},{status:401});
  const {id}=await params; const {data,error}=await supabaseAdmin().from('mp_payments').select('id,status,amount_cents,currency,provider,provider_payment_id,external_reference,created_at,updated_at').eq('id',id).eq('merchant_id',auth.merchantId).maybeSingle();
  if(error) return Response.json({error:'lookup_failed'},{status:500}); if(!data) return Response.json({error:'not_found'},{status:404}); return Response.json(data);
}
