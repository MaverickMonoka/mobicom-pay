# Mobicom Pay v0.3

Mobicom Pay v0.3 is a small Cloudflare Worker payment-orchestration service for SHESHA and other Mobicom products. The active runtime is `src/worker.ts`; Supabase, Next.js and OpenNext are not required by this release.

## Active architecture

Application -> Mobicom Pay Worker -> hosted Mobicom Pay checkout -> PayFast -> verified PayFast ITN -> signed application webhook.

Mobicom Pay does not collect or store card numbers, CVVs or banking credentials. Payment capture happens at PayFast.

## Cloudflare

The deployment is defined by `wrangler.jsonc`:

- Worker: `mobicom-pay`
- Entry point: `src/worker.ts`
- Runtime: Cloudflare Workers with `nodejs_compat`
- Deploy: `npm run deploy`
- Dry run: `npm test`

No OpenNext adapter is used by v0.3.

## Required secrets

Set these with `wrangler secret put <NAME>`:

- `MOBICOM_PAY_API_KEY` — bearer key used by applications to create checkout sessions.
- `MOBICOM_PAY_SESSION_SECRET` — HMAC secret for 30-minute checkout session tokens.
- `MOBICOM_PAY_WEBHOOK_SECRET` — HMAC secret used to sign payment-result webhooks sent to applications.
- `PAYFAST_PASSPHRASE` — must match the passphrase configured at PayFast.

Never commit real values.

## Sandbox

`wrangler.jsonc` contains PayFast sandbox defaults. For local development copy `.dev.vars.example` to `.dev.vars` and replace the placeholders.

Run:

```bash
npm install
npm test
npm run dev
```

Deploy after Cloudflare authentication and secrets are configured:

```bash
npm run deploy
```

Then verify:

```text
GET https://<worker-domain>/health
```

Expected JSON includes `"ok": true`, `"version": "0.3.0"` and `"runtime": "cloudflare-worker"`.

## API

Create a checkout session:

```http
POST /v1/checkout/sessions
Authorization: Bearer <MOBICOM_PAY_API_KEY>
Content-Type: application/json
```

The API also accepts `POST /api/v1/payments` for compatibility.

Required request fields are an amount of at least R1.00, ZAR currency, merchant reference, and HTTPS success, cancel and webhook URLs. A successful response returns `payment_id` and `checkout_url`.

The checkout page creates a signed PayFast request. PayFast notifications are accepted at `POST /api/webhooks/payfast`. Mobicom Pay verifies the PayFast signature, validates the notification with PayFast, verifies the amount, and only then sends a signed `payment.paid` or `payment.failed` event to the application webhook.

Applications must verify `x-mobicom-signature: sha256=<hex>` using `MOBICOM_PAY_WEBHOOK_SECRET` before changing an order's payment state.

## Production switch

Before live payments:

1. Replace sandbox merchant ID/key with the live PayFast merchant credentials. Prefer storing the live merchant key as a Cloudflare secret.
2. Set `PAYFAST_SANDBOX=false`.
3. Set `PAYFAST_SKIP_IP_CHECK=false`.
4. Configure `PAYFAST_ALLOWED_IPS` for the source addresses accepted by the Worker.
5. Confirm every success, cancel and webhook URL is HTTPS.
6. Perform a complete live-mode readiness test before accepting customer payments.

## Release validation

A release is operational only when all of these pass:

- `GET /health` returns 200.
- Missing/incorrect application API key returns 401.
- Valid checkout request returns a checkout URL.
- Invalid amount, currency or non-HTTPS callback URL is rejected.
- Hosted checkout displays the correct amount/reference.
- Sandbox checkout redirects to PayFast sandbox.
- Valid PayFast ITN passes signature, provider and amount validation.
- Forged signature and changed amount are rejected.
- Verified payment sends a signed downstream webhook.
- The receiving application verifies the webhook signature before marking the order paid.
- Cancelled/failed checkout never marks an order paid.

## Persistence

v0.3 deliberately has no Supabase dependency and no Mobicom Pay transaction ledger. Add persistence only when reconciliation, durable merchant management, webhook retries or an operations dashboard are required.
