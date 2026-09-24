export async function POST(req:Request){
  const body=await req.json().catch(()=>null);
  if(!body?.amount_minor||!body?.currency||!body?.merchant_reference||!body?.success_url||!body?.cancel_url){
    return Response.json({error:'invalid_request'},{status:400});
  }
  const upstream=process.env.MOBICOM_PAY_CORE_URL;
  const key=process.env.MOBICOM_PAY_CORE_API_KEY;
  if(!upstream||!key) return Response.json({error:'gateway_not_configured'},{status:503});
  const r=await fetch(upstream.replace(/\/$/,'')+'/api/v1/payments',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+key,'idempotency-key':req.headers.get('idempotency-key')||body.merchant_reference},body:JSON.stringify(body)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) return Response.json(data,{status:r.status});
  return Response.json({id:data.id||data.payment_id||data.reference,checkout_url:data.checkout_url||data.redirect_url||data.redirectUrl,raw:data});
}
