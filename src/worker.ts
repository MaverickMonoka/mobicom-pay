import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { itnSignature } from "../lib/payfast-core.mjs";

interface Env {
  MOBICOM_PAY_API_KEY: string;
  MOBICOM_PAY_SESSION_SECRET: string;
  MOBICOM_PAY_WEBHOOK_SECRET: string;
  PAYFAST_SANDBOX?: string;
  PAYFAST_MERCHANT_ID: string;
  PAYFAST_MERCHANT_KEY: string;
  PAYFAST_PASSPHRASE: string;
  PAYFAST_SKIP_IP_CHECK?: string;
  PAYFAST_ALLOWED_IPS?: string;
}

type SessionPayload = {
  amount_minor: number;
  currency: string;
  merchant_reference: string;
  order_reference?: string;
  description?: string;
  customer_email?: string;
  success_url: string;
  cancel_url: string;
  webhook_url: string;
  metadata?: Record<string, unknown>;
  issued_at: number;
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const b64url = (input: string) =>
  Buffer.from(input, "utf8").toString("base64url");

const fromB64url = (input: string) =>
  Buffer.from(input, "base64url").toString("utf8");

const hmacHex = (secret: string, input: string) =>
  createHmac("sha256", secret).update(input).digest("hex");

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function signSession(payload: Omit<SessionPayload, "issued_at">, env: Env) {
  if (!env.MOBICOM_PAY_SESSION_SECRET) throw new Error("MOBICOM_PAY_SESSION_SECRET is not configured");
  const body = b64url(JSON.stringify({ ...payload, issued_at: Date.now() }));
  return body + "." + hmacHex(env.MOBICOM_PAY_SESSION_SECRET, body);
}

function verifySession(token: string, env: Env): SessionPayload {
  if (!env.MOBICOM_PAY_SESSION_SECRET) throw new Error("MOBICOM_PAY_SESSION_SECRET is not configured");
  const parts = token.split(".");
  if(parts.length!==2)throw new Error("Invalid checkout session");
  const [body, signature] = parts;
  if (!body || !signature) throw new Error("Invalid checkout session");
  const expected = hmacHex(env.MOBICOM_PAY_SESSION_SECRET, body);
  if (!safeEqual(signature, expected)) throw new Error("Invalid checkout session");
  const payload = JSON.parse(fromB64url(body)) as SessionPayload;
  if (!Number.isFinite(payload.issued_at) || payload.issued_at > Date.now() + 60_000 || Date.now() - payload.issued_at > 30 * 60 * 1000) {
    throw new Error("Checkout session expired");
  }
  return payload;
}

function payfastEncode(value: string) {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function payfastSignature(entries: Array<[string, string]>, passphrase: string) {
  const pairs = entries
    .filter(([key, value]) => key !== "signature" && value !== "")
    .map(([key, value]) => key + "=" + payfastEncode(value));
  if (passphrase) pairs.push("passphrase=" + payfastEncode(passphrase));
  return createHash("md5").update(pairs.join("&")).digest("hex");
}

function providerConfig(env: Env) {
  const sandbox = (env.PAYFAST_SANDBOX ?? "true").toLowerCase() !== "false";
  return {
    sandbox,
    processUrl: sandbox
      ? "https://sandbox.payfast.co.za/eng/process"
      : "https://www.payfast.co.za/eng/process",
    validateUrl: sandbox
      ? "https://sandbox.payfast.co.za/eng/query/validate"
      : "https://www.payfast.co.za/eng/query/validate",
  };
}

function authorized(req: Request, env: Env) {
  const supplied = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(env.MOBICOM_PAY_API_KEY) && safeEqual(supplied, env.MOBICOM_PAY_API_KEY);
}

function normalizePaymentBody(body: any) {
  const amount = Number(body?.amount_minor ?? body?.amount_cents ?? 0);
  return {
    amount_minor: amount,
    currency: String(body?.currency ?? "ZAR").toUpperCase(),
    merchant_reference: String(body?.merchant_reference ?? body?.external_reference ?? ""),
    order_reference: body?.order_reference ? String(body.order_reference) : undefined,
    description: body?.description ? String(body.description) : undefined,
    customer_email: body?.customer_email ? String(body.customer_email) : undefined,
    success_url: String(body?.success_url ?? body?.return_url ?? ""),
    cancel_url: String(body?.cancel_url ?? ""),
    webhook_url: String(body?.webhook_url ?? ""),
    metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
  };
}

const providerIps = ['197.97.145.144/28','41.74.179.192/27','102.216.36.0/28','102.216.36.128/28','144.126.193.139'];
function ipv4(input:string):number|null {const parts=input.split('.');if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)||Number(p)>255))return null;return parts.reduce((n,p)=>(n*256+Number(p))>>>0,0)}
function allowedIp(ip:string,rules:string[]){const value=ipv4(ip);if(value===null)return false;return rules.some(rule=>{const [host,bitsText]=rule.split('/');const network=ipv4(host);const bits=bitsText===undefined?32:Number(bitsText);if(network===null||!Number.isInteger(bits)||bits<0||bits>32)return false;const mask=bits===0?0:(0xffffffff<<(32-bits))>>>0;return ((value&mask)>>>0)===((network&mask)>>>0)})}
function publicHttps(input:string){try{const u=new URL(input);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.hostname.includes('.')&&!u.hostname.endsWith('.local')&&!u.hostname.endsWith('.localhost')&&!/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)&&!u.hostname.includes(':')}catch{return false}}
const requiredConfiguration=['MOBICOM_PAY_API_KEY','MOBICOM_PAY_SESSION_SECRET','MOBICOM_PAY_WEBHOOK_SECRET','PAYFAST_MERCHANT_ID','PAYFAST_MERCHANT_KEY','PAYFAST_PASSPHRASE'] as const;
function readiness(env:Env){const missing=requiredConfiguration.filter(name=>!env[name]);const invalid=!providerConfig(env).sandbox&&env.PAYFAST_SKIP_IP_CHECK?.toLowerCase()==='true'?['PAYFAST_SKIP_IP_CHECK must be false in live mode']:[];return {ready:missing.length===0&&invalid.length===0,missing_configuration:missing,invalid_configuration:invalid}}

async function createSession(req: Request, env: Env) {
  if (!authorized(req, env)) return json({ error: "unauthorized" }, 401);
  if(!readiness(env).ready)return json({error:"checkout_not_configured"},503);
  const raw=await req.text();if(raw.length>65536)return json({error:"request_too_large"},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:"invalid_request"},400)}
  const p = normalizePaymentBody(body);
  if (
    !Number.isSafeInteger(p.amount_minor) ||
    p.amount_minor < 100 ||
    p.currency !== "ZAR" ||
    !p.merchant_reference || p.merchant_reference.length>100 || p.webhook_url.length>255 || (p.customer_email?.length??0)>100 ||
    !p.success_url ||
    !p.cancel_url ||
    !p.webhook_url
  ) {
    return json({ error: "invalid_request" }, 400);
  }
  if([p.success_url,p.cancel_url,p.webhook_url].some(url=>!publicHttps(url)))return json({error:'invalid_url'},400);
  if(JSON.stringify(p).length>4096)return json({error:"checkout_payload_too_large"},413);
  const token = signSession(p, env);
  const origin = new URL(req.url).origin;
  const paymentId = "mp_" + hmacHex(env.MOBICOM_PAY_SESSION_SECRET, p.merchant_reference).slice(0, 24);
  return json({
    id: paymentId,
    payment_id: paymentId,
    status: "pending",
    provider: "mobicom_pay",
    checkout_url: origin + "/checkout/" + encodeURIComponent(token),
  });
}

function checkoutHtml(req: Request, token: string, payload: SessionPayload, env: Env) {
  const provider = providerConfig(env);
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_MERCHANT_KEY || !env.PAYFAST_PASSPHRASE) {
    return new Response("Settlement provider is not configured", { status: 503 });
  }

  const origin = new URL(req.url).origin;
  const fields: Array<[string, string]> = [
    ["merchant_id", env.PAYFAST_MERCHANT_ID],
    ["merchant_key", env.PAYFAST_MERCHANT_KEY],
    ["return_url", payload.success_url],
    ["cancel_url", payload.cancel_url],
    ["notify_url", origin + "/api/webhooks/payfast"],
    ["m_payment_id", payload.merchant_reference],
    ["amount", (payload.amount_minor / 100).toFixed(2)],
    ["item_name", (payload.description || "SHESHA order " + (payload.order_reference || payload.merchant_reference)).slice(0, 100)],
    ["custom_str1", payload.webhook_url],
    ["custom_str2", payload.merchant_reference],
    ["custom_str3", String(payload.amount_minor)],
  ];
  if (payload.customer_email) fields.push(["email_address", payload.customer_email]);
  fields.push(["signature", payfastSignature(fields, env.PAYFAST_PASSPHRASE)]);

  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const inputs = fields
    .map(([k, v]) => '<input type="hidden" name="' + esc(k) + '" value="' + esc(v) + '">')
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mobicom Pay</title><style>
*{box-sizing:border-box}body{margin:0;background:#07110a;color:#fff;font-family:Inter,Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:18px}
.card{width:min(560px,100%);background:#101914;border:1px solid #23382a;border-radius:28px;padding:28px;box-shadow:0 24px 80px #0008}
.logo{display:flex;align-items:center;gap:12px;font-weight:900;letter-spacing:.08em}.mark{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#19c65b;color:#041108;font-size:22px}
.eyebrow{margin-top:26px;color:#19c65b;font-size:11px;font-weight:900;letter-spacing:.16em}.title{font-size:42px;line-height:1;margin:8px 0 12px;letter-spacing:-.04em}
.copy{color:#9db0a1;line-height:1.55}.row{display:flex;justify-content:space-between;gap:16px;border-top:1px solid #26372c;padding:15px 0}.row span{color:#8da093}
button{width:100%;border:0;border-radius:15px;padding:16px;background:#19c65b;color:#061109;font-size:15px;font-weight:900;cursor:pointer}.fine{font-size:11px;color:#718077;text-align:center;margin-top:13px}
</style></head><body><main class="card"><div class="logo"><span class="mark">M</span>MOBICOM PAY</div>
<div class="eyebrow">SECURE CHECKOUT</div><h1 class="title">Complete your payment</h1>
<p class="copy">Your SHESHA payment is being handled by Mobicom Pay. Card details are entered with the settlement processor and are not stored by Mobicom Pay.</p>
<div class="row"><span>Amount</span><strong>R ${(payload.amount_minor / 100).toFixed(2)}</strong></div>
<div class="row"><span>Reference</span><strong>${esc(payload.order_reference || payload.merchant_reference)}</strong></div>
<form method="post" action="${provider.processUrl}">${inputs}<button type="submit">Continue securely</button></form>
<div class="fine">Mobicom Pay · A Mobicom X product · ${provider.sandbox ? "Sandbox" : "Live"} settlement rail</div>
</main></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy":"no-referrer", "x-content-type-options":"nosniff", "x-frame-options":"DENY", "content-security-policy":`default-src 'none'; style-src 'unsafe-inline'; form-action ${provider.processUrl}; base-uri 'none'; frame-ancestors 'none'` } });
}

async function payfastWebhook(req: Request, env: Env) {
  const provider = providerConfig(env);
  const raw = await req.text();
  if(raw.length>65536)return new Response("request too large",{status:413});
  const params = new URLSearchParams(raw);
  const entries = Array.from(params.entries());
  const supplied = params.get("signature") || "";
  if(!env.PAYFAST_PASSPHRASE)return new Response("Settlement provider is not configured",{status:503});
  if(new Set(entries.map(([key])=>key)).size!==entries.length)return new Response("duplicate fields",{status:400});
  if(entries.at(-1)?.[0]!=="signature")return new Response("signature must be last",{status:400});
  const expected = itnSignature(entries, env.PAYFAST_PASSPHRASE);

  if (!supplied || !safeEqual(supplied, expected)) return new Response("invalid signature", { status: 400 });

  if (!provider.sandbox || (env.PAYFAST_SKIP_IP_CHECK ?? "false").toLowerCase() !== "true") {
    const ip = req.headers.get("cf-connecting-ip") || "";
    const allowed = env.PAYFAST_ALLOWED_IPS ? env.PAYFAST_ALLOWED_IPS.split(",").map(x=>x.trim()).filter(Boolean) : providerIps;
    if (!allowedIp(ip,allowed)) return new Response("source ip rejected", { status: 403 });
  }

  const validation = await fetch(provider.validateUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: raw,
    signal:AbortSignal.timeout(15000),
  });
  const validationText = (await validation.text()).trim().toUpperCase();
  if (!validation.ok || validationText !== "VALID") return new Response("provider validation failed", { status: 400 });

  if(params.get("merchant_id")!==env.PAYFAST_MERCHANT_ID)return new Response("merchant mismatch",{status:400});
  const expectedMinor = Number(params.get("custom_str3") || 0);
  const gross=params.get("amount_gross")||"";
  if(!/^\d+(?:\.\d{1,2})?$/.test(gross))return new Response("invalid amount",{status:400});
  const [whole,fraction=""]=gross.split(".");
  const actualMinor=Number(whole)*100+Number(fraction.padEnd(2,"0"));
  if (!Number.isSafeInteger(expectedMinor) || expectedMinor < 100 || expectedMinor !== actualMinor) return new Response("amount mismatch", { status: 400 });

  const webhookUrl = params.get("custom_str1") || "";
  const merchantReference = params.get("custom_str2") || params.get("m_payment_id") || "";
  if (!webhookUrl || !merchantReference || merchantReference!==params.get("m_payment_id")) return new Response("missing correlation data", { status: 400 });
  if(!publicHttps(webhookUrl))return new Response("invalid webhook url",{status:400});

  const status=(params.get("payment_status")||"").toUpperCase();
  if(!["COMPLETE","CANCELLED","FAILED"].includes(status))return new Response("unknown payment status",{status:400});
  const paid=status==="COMPLETE";
  const state=paid?"paid":status==="CANCELLED"?"cancelled":"failed";
  const event = {
    event_id: "payfast:" + (params.get("pf_payment_id") || merchantReference) + ":" + state,
    event_type: "payment."+state,
    data: {
      id: params.get("pf_payment_id") || merchantReference,
      merchant_reference: merchantReference,
      status: state,
      amount_minor: actualMinor,
      currency: "ZAR",
      provider: "mobicom_pay",
      processor: "payfast",
    },
  };

  if (!env.MOBICOM_PAY_WEBHOOK_SECRET) return new Response("webhook secret not configured", { status: 500 });
  const eventRaw = JSON.stringify(event);
  const signature = hmacHex(env.MOBICOM_PAY_WEBHOOK_SECRET, eventRaw);
  const downstream = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mobicom-event": event.event_type,
      "x-mobicom-signature": "sha256=" + signature,
      "x-gateway-signature": "sha256=" + signature,
    },
    body: eventRaw,
    signal:AbortSignal.timeout(15000),
  });

  if (!downstream.ok) return new Response("downstream webhook failed", { status: 502 });
  return new Response("OK", { status: 200 });
}

function home() {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mobicom Pay</title>
<style>body{margin:0;background:#07110a;color:#fff;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh}.c{width:min(760px,calc(100% - 32px));padding:32px;border:1px solid #24392b;border-radius:26px;background:#101914}b{color:#19c65b}h1{font-size:54px;line-height:.95;letter-spacing:-.05em}p{color:#9bad9f;line-height:1.6}</style></head>
<body><main class="c"><b>MOBICOM X PAYMENT INFRASTRUCTURE</b><h1>Mobicom Pay</h1><p>Secure payment orchestration for SHESHA and Mobicom products. Hosted checkout, server-verified provider notifications and signed application webhooks.</p></main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && (url.pathname === "/api/v1/health" || url.pathname === "/health")) {
        return json({ok:true,...readiness(env),mode:providerConfig(env).sandbox?'sandbox':'live',service:'mobicom-pay',version:'0.3.2',runtime:'cloudflare-worker'});
      }
      if (req.method === "POST" && (url.pathname === "/v1/checkout/sessions" || url.pathname === "/api/v1/payments")) {
        return await createSession(req, env);
      }
      if (req.method === "GET" && url.pathname.startsWith("/checkout/")) {
        const token = decodeURIComponent(url.pathname.slice("/checkout/".length));
        let payload:SessionPayload;try{payload=verifySession(token,env)}catch{return json({error:"invalid_or_expired_checkout"},400)}
        return checkoutHtml(req, token, payload, env);
      }
      if (req.method === "POST" && url.pathname === "/api/webhooks/payfast") {
        return await payfastWebhook(req, env);
      }
      if (req.method === "GET" && url.pathname === "/") return home();
      return json({ error: "not_found" }, 404);
    } catch (error) {
      if(error instanceof Error&&["TimeoutError","AbortError"].includes(error.name))return json({error:"gateway_timeout"},504);
      return json({error:"gateway_unavailable"},503);
    }
  },
};
