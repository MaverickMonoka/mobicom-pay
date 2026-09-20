import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildCheckout } from '@/lib/payfast';

export const dynamic='force-dynamic';

export default async function Checkout({params,searchParams}:{params:Promise<{id:string}>,searchParams:Promise<{result?:string}>}){
  const {id}=await params; const query=await searchParams;
  const {data:p}=await supabaseAdmin().from('mp_payments').select('id,status,amount_cents,currency,description,external_reference,customer_email,return_url,cancel_url,mp_merchants(name)').eq('id',id).maybeSingle();
  if(!p) notFound();
  const merchant=Array.isArray(p.merchants)?p.merchants[0]:p.merchants;
  const checkout=buildCheckout(p);
  return <main className="shell"><header className="topbar"><a href="/" className="brand"><span className="mark">M</span>MOBICOM PAY</a><span className="badge">Secure checkout</span></header><section className="checkout card">
    <div className="eyebrow">{merchant?.name || 'Merchant'}</div><h1>{p.description}</h1><div className="price">R {(p.amount_cents/100).toFixed(2)}</div>
    <div className="row"><span className="muted">Payment ID</span><span>{p.id.slice(0,8)}…</span></div><div className="row"><span className="muted">Provider</span><span>PayFast</span></div><div className="row"><span className="muted">Status</span><span className={`status ${p.status}`}>{p.status}</span></div>
    {query.result==='return' && <p className="muted">You returned from PayFast. Final payment status is confirmed by the secure PayFast notification, not by this browser redirect.</p>}
    {query.result==='cancel' && <p className="muted">The PayFast checkout was cancelled. No success is assumed until a valid payment notification is received.</p>}
    {p.status==='pending' ? <form action={checkout.action} method="post" className="form" style={{marginTop:24}}>{checkout.fields.map(([k,v])=><input key={k} type="hidden" name={k} value={v}/>)}<button className="btn" type="submit">Pay securely with PayFast</button></form> : <p style={{marginTop:24}}>This payment is <strong>{p.status}</strong> and cannot be submitted again from this checkout.</p>}
    <p className="muted" style={{fontSize:12,marginTop:18}}>Mobicom Pay does not collect or store your card number or CVV. Payment entry is handled by PayFast.</p>
  </section></main>;
}
