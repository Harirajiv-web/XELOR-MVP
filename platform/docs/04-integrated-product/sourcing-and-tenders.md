# AIKYANTRA: supplier network and tenders

AIKYANTRA owns supplier profiles, invitations, RFQs, responses and tenders. In the Integrated workspace, it connects with ONYX intelligence and uses ordinary XELOR ERP purchase orders for RFQ and tender awards. A tender groups 1–100 RFQ lines. Publish opens bidding, close stops bidding and begins evaluation, and award selects exactly one approved quote for every remaining line. All award lines and their draft purchase orders commit together. Purchase-order approval remains a separate existing ERP control.

A second person must award an RFQ or tender raised by the buyer. Awards require a passed technical gate or a recorded conditional deviation, a confirmed date no later than the need date, an MOQ within the requested quantity, and an unexpired price where validity is supplied. A buyer cannot hide a late supplier promise by typing an earlier purchase-order date.

Quotation conversion and RFQ/tender awards use a single tenant-scoped transaction. They acquire the existing audit-chain advisory lock before document and numbering locks. Requests with distinct idempotency keys therefore cannot create multiple orders from the same source. A transaction failure also rolls back the order; the source link cannot be left behind by a separate committed order creation.

Network submissions are received through an expiring invitation and copied into formal quotes only by a buyer. Accepting a response from an active network supplier linked to an active ERP vendor establishes its ordinary RFQ invitation atomically. MOQ is preserved. A timely submission can be reviewed after bidding closes; new bids cannot arrive after the deadline or tender close. Supplier token hashes are tenant scoped, and expiry is capped at the response deadline.

New quotes interpret tooling, freight and non-creditable tax as order-level charges. Their comparable landed unit cost is `unit price + (tooling + freight + non-creditable tax) / quantity`, rounded to two decimals. Original historical price snapshots are not rewritten. Purchase orders retain the supplier's quoted unit price and carry the one-off costs in `additionalCharges`; the approval total includes both line value and charges. Source charge details remain in the RFQ quote and purchase-order remarks. Editing order lines preserves the existing charges unless an authorized amendment changes them.

DESK counts each RFQ/supplier identity once even when the supplier was invited directly and through multiple broadcasts. Best usable quotes require the commercial and technical gates; an unreviewed network response is not an award recommendation. Potential savings compare eligible quotes at the requested quantity. `savingsBasis` is `estimated_quote_comparison` and `realizedSavings` is null: this dashboard does not claim proven cost savings against an established purchasing baseline.

Supplier performance comes from posted goods receipts and completed incoming inspections. On-time delivery rates use completed purchase orders with a known expected date and a posted receipt. A partial receipt is not treated as complete delivery. Results include sample counts, source document evidence, material quantities and unknown rates as null. An unmeasured supplier does not receive a fabricated reliability score. Quality rates are reported from inspected quantities, not total receipts; different material quantities should be read with their units.

## API

- `GET/POST /api/v1/purchase/network/tenders`
- `GET /api/v1/purchase/network/tenders/:id`
- `POST /api/v1/purchase/network/tenders/:id/publish`
- `POST /api/v1/purchase/network/tenders/:id/close`
- `POST /api/v1/purchase/network/tenders/:id/cancel` with `{ "reason": "..." }`
- `POST /api/v1/purchase/network/tenders/:id/award` with `{ "awards": [{ "rfqId": "...", "quoteId": "...", "awardReason": "..." }] }`
- `GET /api/v1/purchase/network/suppliers/:id/performance`

Every mutation requires `Idempotency-Key`; existing purchase RFQ permissions govern tender lifecycle operations. RFQ quote, technical-gate, broadcast and supplier submission endpoints are reused for tender lines.

## Notifications

Preview is the default and sends nothing. `previewed` is distinct from `sent`, and preview does not set `sentAt`.

Email uses Resend's HTTP API with an outbox-specific idempotency key. Set `NOTIFY_EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `NOTIFY_EMAIL_FROM` after verifying a sender domain. The implementation follows [Resend's send API](https://resend.com/docs/api-reference/emails/send-email) and [idempotency contract](https://resend.com/docs/dashboard/emails/idempotency-keys).

WhatsApp uses Meta's template message endpoint. Set `NOTIFY_WHATSAPP_PROVIDER=whatsapp_cloud`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and an explicitly supported `WHATSAPP_GRAPH_VERSION` such as `v22.0`. `WHATSAPP_TEMPLATES_JSON` maps local template keys to the approved provider template and positional body variables. Example shape:

```json
{"rfq_invitation":{"name":"approved_rfq_invite","language":"en","bodyVariables":["buyerName","rfqNo","itemLabel","qty","needDate","quoteDeadline","link"]}}
```

Configure the template to match its actual approved placeholder sequence. See [Meta's template message documentation](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/) and [Meta's official Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

Live delivery requires `NOTIFY_ENCRYPTION_KEY`, 32 random bytes encoded as 64 hexadecimal characters. Full message body, variables and invitation URL are AES-256-GCM encrypted at rest, bound to tenant and outbox ID. Keep the encryption key in the deployment secret store and preserve it across restarts. The invitation table itself stores only a token hash. Preview without an encryption key deliberately retains readable links, so its database must be protected as containing bearer credentials. Authorized staff can inspect rendered outbox messages.

`SOURCE_PORTAL_BASE_URL` must be the supplier-accessible web origin. `SOURCE_BUYER_WHATSAPP` is optional; a buyer alert is created only when an actual destination is configured. `SOURCE_INVITE_TTL_HOURS` is capped at 336 hours and the bid deadline.

The `SOURCE_*` deployment variables remain compatibility identifiers for AIKYANTRA; they do not denote a separate product.

Delivery claims commit before network I/O. Concurrent workers cannot send the same pending row. Provider errors remain visible. Timeouts, unreadable receipts and server errors become `delivery_unknown`; a crashed sender can remain `sending`. Neither state is automatically retried because the message may already have reached the provider. An operator must reconcile it with the provider receipt before any resend. Provider acceptance is recorded as sent; delivered/read webhooks are not yet implemented.

## Verification

The focused test suite covers landed costs, deadline boundaries, award restrictions, supplier evidence denominators, provider payload contracts, configuration failures and uncertain delivery handling using injected fetch implementations. No real recipients are contacted by these tests.

`apps/api/scripts/demo/05-seed-integrated-tender.mjs` exercises the real authenticated API and public supplier portal in an isolated preview demo. It creates a two-line tender, accepts a network supplier who was not originally a direct RFQ invitee, proves commercial-gate rollback and separation of duties, races two tender awards under different keys, and verifies two linked draft POs. Run after the base world and with `DEMO_PUBLIC_MODE=true` plus the demo API origin in `API_BASE`.
