import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {build} from 'esbuild';
import {itnSignature} from '../lib/payfast-core.mjs';
const output=await build({entryPoints:['src/worker.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
const env={MOBICOM_PAY_API_KEY:'test-key',MOBICOM_PAY_SESSION_SECRET:'test-session',MOBICOM_PAY_WEBHOOK_SECRET:'test-hook',PAYFAST_MERCHANT_ID:'10000100',PAYFAST_MERCHANT_KEY:'test-merchant',PAYFAST_PASSPHRASE:'test-pass',PAYFAST_SANDBOX:'true',PAYFAST_SKIP_IP_CHECK:'true'};
const input={amount_minor:12345,currency:'ZAR',merchant_reference:'payment-1',success_url:'https://shesha.example/orders',cancel_url:'https://shesha.example/orders',webhook_url:'https://shesha.example/webhook'};
const create=body=>worker.fetch(new Request('https://pay.example/v1/checkout/sessions',{method:'POST',headers:{authorization:'Bearer test-key'},body:JSON.stringify(body)}),env);
test('health distinguishes running service from configured checkout',async()=>{
 const r=await worker.fetch(new Request('https://pay.example/health'),{});const b=await r.json();assert.equal(b.ok,true);assert.equal(b.ready,false);assert.ok(b.missing_configuration.includes('MOBICOM_PAY_API_KEY'));
});
test('authenticated checkout preserves exact amount and signed session',async()=>{
 const r=await create(input);assert.equal(r.status,200);const b=await r.json();const page=await worker.fetch(new Request(b.checkout_url),env);assert.equal(page.status,200);const html=await page.text();assert.match(html,/123.45/);assert.match(html,/sandbox.payfast.co.za/);
 const forged=await worker.fetch(new Request(b.checkout_url+'x'),env);assert.notEqual(forged.status,200);
});
test('fractional minor units, unsafe amounts, HTTP redirects and missing authentication are rejected',async()=>{
 for(const body of [{...input,amount_minor:100.5},{...input,amount_minor:Number.MAX_SAFE_INTEGER+1},{...input,success_url:'http://shesha.example'}])assert.equal((await create(body)).status,400);
 const r=await worker.fetch(new Request('https://pay.example/v1/checkout/sessions',{method:'POST',body:JSON.stringify(input)}),env);assert.equal(r.status,401);
});
function notification(changes={}){
 const data={m_payment_id:'payment-1',pf_payment_id:'provider-1',payment_status:'COMPLETE',item_description:'',amount_gross:'123.45',custom_str1:input.webhook_url,custom_str2:'payment-1',custom_str3:'12345',custom_str4:'',merchant_id:env.PAYFAST_MERCHANT_ID,...changes};
 const entries=Object.entries(data);return new URLSearchParams([...entries,['signature',itnSignature(entries,env.PAYFAST_PASSPHRASE)]]).toString();
}
test('ITN with empty fields validates and forwards an exact signed SHESHA payment event',async()=>{
 const original=globalThis.fetch;const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(calls.length===1?'VALID':'OK')};
 try{const r=await worker.fetch(new Request('https://pay.example/api/webhooks/payfast',{method:'POST',body:notification()}),env);assert.equal(r.status,200);assert.equal(calls.length,2);assert.equal(calls[1].url,input.webhook_url);const event=JSON.parse(calls[1].options.body);assert.equal(event.data.amount_minor,12345);assert.equal(event.data.status,'paid');assert.equal(event.data.merchant_reference,'payment-1');assert.equal(calls[1].options.headers['x-mobicom-signature'],'sha256='+createHmac('sha256',env.MOBICOM_PAY_WEBHOOK_SECRET).update(calls[1].options.body).digest('hex'));}finally{globalThis.fetch=original}
});
test('wrong amount, wrong merchant and forged signature do not reach the SHESHA webhook',async()=>{
 const original=globalThis.fetch;const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response('VALID')};
 try{for(const raw of [notification({amount_gross:'1.00'}),notification({merchant_id:'other'}),notification().replace(/signature=[^&]+/,'signature=invalid')]){const r=await worker.fetch(new Request('https://pay.example/api/webhooks/payfast',{method:'POST',body:raw}),env);assert.equal(r.status,400)}assert.ok(calls.every(x=>x!==input.webhook_url));}finally{globalThis.fetch=original}
});
