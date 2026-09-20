# Mobicom Pay v0.2

Mobicom Pay is a Mobicom-controlled payment orchestration layer for Dokta, Shesha, TenderGenie and other Mobicom products. It exposes one merchant API, hosts a branded checkout, verifies PayFast Instant Transaction Notifications (ITNs), keeps a payment ledger, and sends signed payment webhooks back to each connected app.

## Security boundary

Mobicom Pay **does not collect or store card numbers, CVVs, bank credentials or wallet credentials**. The customer is redirected to PayFast for regulated payment capture. Mobicom Pay stores transaction references and state only.

PayFast's current custom-integration requirements include signed payment requests and ITN validation. Production ITN handling should verify the signature, source, amount and server confirmation. This project implements those checks.

## Stack

- Next.js 16 / Node runtime
- Supabase Postgres (server-only access; RLS enabled and anon/auth grants revoked)
- PayFast hosted checkout adapter (sandbox + live)
- HMAC-SHA256 outbound webhooks
- Deployable on Netlify, Vercel or another Node-compatible host

## 1. Database

Create a dedicated Supabase project for payment infrastructure. Run `supabase/migrations/001_mobicom_pay.sql` in the SQL editor.

Do not reuse a customer-facing app database for production payment infrastructure unless you deliberately accept that operational coupling.

## 2. Environment

Copy `.env.example` to `.env.local` and set the values. Keep `SUPABASE_SECRET_KEY`, `PAYFAST_PASSPHRASE`, `ADMIN_TOKEN` and `CRON_SECRET` server-side only.

For sandbox use:

```env
PAYFAST_SANDBOX=true
PAYFAST_MERCHANT_ID=10000100
PAYFAST_MERCHANT_KEY=46f0cd694581a
```

Set your own PayFast sandbox passphrase in both PayFast and `PAYFAST_PASSPHRASE`.

## 3. Install and run

```bash
npm install
npm test
npm run dev
```

## 4. Create an app / merchant

After the schema is installed:

```bash
npm run merchant:create -- "Dokta" dokta https://YOUR-DOKTA-DOMAIN/api/webhooks/mobicom
```

The script prints an API key once. Store it in the Dokta server environment. It also prints a webhook signing secret when a webhook URL is supplied.

Repeat for Shesha, TenderGenie, Jewish Ya Strata, Maverick Safety, etc.

## 5. Create a payment from an app

```bash
curl -X POST https://pay.example.co.za/api/v1/payments \
  -H "Authorization: Bearer mp_test_REPLACE" \
  -H "Idempotency-Key: order-123" \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 49900,
    "currency": "ZAR",
    "description": "Dokta consultation",
    "external_reference": "APT-123",
    "customer_email": "customer@example.com",
    "return_url": "https://dokta.example.com/payment/return",
    "cancel_url": "https://dokta.example.com/payment/cancel"
  }'
```

The response includes a `checkout_url`. Redirect the customer to it. The hosted Mobicom Pay page generates the signed PayFast form server-side.

## 6. Check payment status

```bash
curl https://pay.example.co.za/api/v1/payments/PAYMENT_UUID \
  -H "Authorization: Bearer mp_test_REPLACE"
```

Never mark an order paid because the browser returned from PayFast. Treat the verified ITN/webhook as the authoritative payment result.

## 7. Verify Mobicom Pay webhooks in your apps

Mobicom Pay posts JSON and includes:

- `x-mobicom-event: payment.paid`
- `x-mobicom-signature: sha256=<hex HMAC>`

Calculate `HMAC-SHA256(raw_request_body, merchant_webhook_secret)` and compare it using a constant-time function. Only then update the app order/appointment/subscription.

## 8. Retry failed app webhooks

Call `POST /api/internal/retry-webhooks` with `Authorization: Bearer <CRON_SECRET>`. The endpoint retries up to 20 due outbox events per invocation with exponential backoff.

## 9. Dashboard

`/admin` is protected by the `ADMIN_TOKEN` environment variable and an HttpOnly, SameSite=Strict cookie. This is sufficient for a private v0.2 operations dashboard, not a multi-user staff identity system. Add Supabase Auth/RBAC before giving multiple staff members access.

## Production checklist

1. Use a dedicated production Supabase project and live PayFast credentials.
2. Set `PAYFAST_SANDBOX=false`.
3. Keep `PAYFAST_SKIP_IP_CHECK=false` in production.
4. Use HTTPS on the Mobicom Pay domain and all app webhook URLs.
5. Rotate API keys and webhook secrets if exposed.
6. Add rate limiting/WAF at the hosting layer before public launch.
7. Run security and performance advisors on Supabase after applying the schema.
8. Test: successful payment, cancelled checkout, invalid signature, wrong amount, duplicate ITN, duplicate idempotency key, failed app webhook, and retry delivery.
9. Do not add direct card-entry fields to Mobicom Pay unless you intentionally take on the relevant PCI DSS scope and provider requirements.

## v0.2 roadmap

- Yoco/Ozow/Peach gateway adapters behind the same Mobicom API
- Move per-merchant webhook/provider secrets to Supabase Vault and add provider routing
- Subscription/billing plans for TenderGenie and Dokta
- Refund orchestration where the selected provider API supports it
- Staff accounts + RBAC + audit log
- Reconciliation exports and settlement matching
- API-key rotation UI and provider health monitoring
