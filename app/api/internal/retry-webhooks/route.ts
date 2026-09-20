import { safeEqual } from '@/lib/crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { dispatchOutboundEvent } from '@/lib/webhooks';
export const runtime='nodejs';
export async function POST(req:Request){const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/,'');const expected=process.env.CRON_SECRET||'';if(!token||!expected||!safeEqual(token,expected)) return Response.json({error:'unauthorized'},{status:401});const {data}=await supabaseAdmin().from('mp_outbound_events').select('id').eq('status','pending').lte('next_attempt_at',new Date().toISOString()).order('created_at',{ascending:true}).limit(20);let delivered=0;for(const row of data||[]) if(await dispatchOutboundEvent(row.id)) delivered++;return Response.json({processed:data?.length||0,delivered});}
