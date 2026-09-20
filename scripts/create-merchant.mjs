import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const [name,slug,webhookUrl='']=process.argv.slice(2);if(!name||!slug){console.error('Usage: npm run merchant:create -- "Dokta" dokta https://app.example.com/api/webhooks/mobicom');process.exit(1)}
const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;if(!url||!key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});const webhookSecret=`mwh_${randomBytes(32).toString('base64url')}`;const {data:m,error:me}=await db.from('mp_merchants').insert({name,slug,webhook_url:webhookUrl||null,webhook_secret:webhookUrl?webhookSecret:null}).select('id').single();if(me) throw me;
const env=(process.env.PAYFAST_SANDBOX||'true').toLowerCase()==='true'?'test':'live';const raw=`mp_${env}_${randomBytes(32).toString('base64url')}`;const hash=createHash('sha256').update(raw).digest('hex');const {error:ke}=await db.from('mp_api_keys').insert({merchant_id:m.id,key_name:'default',key_prefix:raw.slice(0,14),key_hash:hash});if(ke) throw ke;
console.log(JSON.stringify({merchant_id:m.id,api_key:raw,webhook_secret:webhookUrl?webhookSecret:null,note:'Save these now. The API key is stored only as a hash.'},null,2));
