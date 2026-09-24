export async function POST(req:Request){
  const body=await req.json().catch(()=>null);
  if(!body) return Response.json({error:'invalid_json'},{status:400});
  const idem=req.headers.get('idempotency-key');
  if(!idem) return Response.json({error:'idempotency_key_required'},{status:400});
  return Response.json({error:'provider_adapter_not_configured',message:'Mobicom Pay core is online, but a settlement provider adapter still needs to be configured.'},{status:503});
}
