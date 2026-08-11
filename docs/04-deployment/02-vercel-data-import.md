# Spreadsheet import on Vercel

Spreadsheet import deliberately sends each accepted row through the entity's ordinary API
route. That preserves the caller's permissions, validation, duplicate checks, audit entry,
outbox event and idempotency ledger.

Vercel Functions are request-isolated, so the API must not assume that `127.0.0.1:$PORT`
is a reachable copy of itself. Configure the API project's own public HTTPS origin in every
Vercel environment where import is enabled:

```dotenv
API_SELF_ORIGIN=https://your-api-project.vercel.app
```

Use an origin only: no `/api/v1` suffix, credentials, query or fragment. The import client
adds `/api/v1` and the target path itself.

If the variable is absent or malformed on Vercel/Lambda, inspection remains available but
live lookups and commit fail closed with `IMPORT_SELF_ORIGIN_REQUIRED` or
`IMPORT_SELF_ORIGIN_INVALID`. This is intentional: guessing loopback in a serverless
invocation can call no listener or wait on the function currently serving the request.

After setting or changing the variable, redeploy the API and verify an import that requires
a live lookup and a one-row commit. The configured origin must route to this API deployment,
not the Next.js web project unless that project explicitly proxies every `/api/v1` request.
