# IND-CORE MVP prototype — environment notes

## Docker is installed (inside WSL, not on Windows)

Docker Desktop is **not** installed (it needs admin, which this machine lacks). Instead, **Docker Engine runs inside a WSL2 Ubuntu distro**. There is no `C:\Program Files\Docker`. Access Docker by prefixing commands with `wsl -d Ubuntu -u root -e`:

```powershell
wsl -d Ubuntu -u root -e docker ps
wsl -d Ubuntu -u root -e docker compose version
```

- The daemon **auto-starts** via systemd on WSL boot; Docker data lives at `/var/lib/docker` inside WSL.
- Verify it exists with: `wsl -d Ubuntu -u root -e docker version`

### Windows CAN reach WSL — corrected 26 Jul 2026

This file previously said the Hyper-V firewall blocked host→WSL inbound. **Measured, and it
does not.** From Windows, all of these answer:

| Target | Kind | Result |
|---|---|---|
| `localhost:3000` | WSL **process** (the API) | reachable |
| `localhost:8080` | **container** (Keycloak) | reachable — issuer `http://localhost:8080/realms/indcore` |
| `localhost:5432` | **container** (Postgres) | reachable |
| `172.28.47.144:*` | WSL's own IP | reachable |

The earlier conclusion came from testing too soon after starting a service: a WSL job takes
~7 s to spawn, and a 4 s wait produced a connection refusal that looked like a firewall.
**Wait for readiness before concluding a port is blocked.** The WSL IP changes across
restarts, so prefer `localhost`.

This matters because it is what makes the web app viewable: the browser on Windows reaches
the API and redirects to Keycloak for sign-in, with no proxy or tunnel.

Bring up Postgres:
```powershell
wsl -d Ubuntu -u root -e sh -c "cd '/mnt/e/ERP/MVP FILES/MVP_PROTOTYPE_1' && docker compose -f infra/docker-compose.yml up -d postgres"
```

## Keeping the two servers alive

Both die if they are tied to a shell that ends. That has happened repeatedly and looks like
a code failure when it is not — the app simply stops answering on :3001 with everything
else still healthy.

**The API (WSL, :3000).** WSL shuts the distro down when its last process exits, so a
`nohup`-ed API dies with the invocation that started it. Start it as a *long-lived
foreground process in a background task* so something keeps holding the distro open:

```
wsl -d Ubuntu -u root -e sh -c "cd /root/proj/apps/api && DATABASE_URL='postgres://app_user:app_pw@127.0.0.1:5432/indcore' KEYCLOAK_URL='http://localhost:8080' KEYCLOAK_REALM='indcore' exec node dist/src/main.js"
```

`/root/proj` is a copy. After editing under `E:\…`, re-sync and rebuild inside WSL before
restarting — the Windows-side build does not reach it:

```
wsl -d Ubuntu -u root -e sh -c "cd '/mnt/e/ERP/MVP FILES/MVP_PROTOTYPE_1' && tar cf - --exclude=node_modules --exclude=.git --exclude=dist --exclude=.next --exclude=_scratch . | (cd /root/proj && tar xf -)"
wsl -d Ubuntu -u root -e sh -c "cd /root/proj && pnpm --filter @ind-core/platform build && pnpm --filter @ind-core/db build && pnpm --filter @ind-core/api build"
```

**The web app (Windows, :3001).** `npx next start` from a shell task exits 127 when that
task is torn down. Detach it from the shell instead:

```powershell
Start-Process -FilePath "E:\ERP\MVP FILES\MVP_PROTOTYPE_1\apps\web\node_modules\.bin\next.CMD" `
  -ArgumentList "start","--port","3001" `
  -WorkingDirectory "E:\ERP\MVP FILES\MVP_PROTOTYPE_1\apps\web" -WindowStyle Hidden
```

Free the port first — `Get-NetTCPConnection -LocalPort 3001 -State Listen` then
`Stop-Process` — because Next fails with `EADDRINUSE` rather than taking the port over.

**Check all three before concluding anything is broken.** `web:200 · api:401 · kc:200` is
the healthy state; the API's 401 is the auth guard answering, not a fault.

## The stale-`dist` trap

`packages/platform` and `packages/db` are consumed through `dist/`, not source. A stale
`dist` makes `tsc --noEmit` in `apps/api` report dozens of "has no exported member" errors
that have nothing to do with the code being reviewed. Rebuild both before believing them:

```
pnpm --filter @ind-core/platform build && pnpm --filter @ind-core/db build
```

The API itself builds with SWC, which is transpile-only — it never typechecks. Run
`tsc --noEmit` explicitly or a type error ships.

## Running the DB-gated proofs

The proofs (`db:migrate`, `db:rls-check`, the two-tenant RLS leak probe) run **inside WSL** from a copy at `/root/proj` (Linux-native `node_modules` — do **not** reuse the Windows `node_modules` on `/mnt/e`). They read `DATABASE_URL` / `DATABASE_OWNER_URL` from env directly (no dotenv), pointed at `127.0.0.1:5432`:

- `DATABASE_URL=postgres://app_user:app_pw@127.0.0.1:5432/indcore`
- `DATABASE_OWNER_URL=postgres://indcore_owner:owner_pw@127.0.0.1:5432/indcore`

`/root/proj` is a **copy**; after editing source under `E:\...`, re-copy (tar excluding `node_modules`/`.git`/`dist`) before re-running.
