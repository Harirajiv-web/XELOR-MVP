# XELOR MVP prototype — environment notes

## Four things about the web app that are easy to break by accident

**1. The shell lives in a layout, not in the pages.** `src/app/(app)/layout.tsx` renders
`<AppShell>`, and `(app)` is a route group so the URLs are unchanged. Do **not** put
`<AppShell>` back into a page. A page is torn down and rebuilt on every navigation, which
is what previously reset the sidebar's scroll position, collapsed the module tree and wiped
the copilot conversation on every single click. `callback` and `not-found` stay outside the
group deliberately — neither should be wrapped in menus.

**2. Colour is never written down in a screen.** Every value is a CSS custom property in
`globals.css`, and `:root[data-theme="dark"]` redefines the whole set. A screen using
tokens is themed for free; a screen with a literal hex or a Tailwind palette class
(`bg-slate-50`, `text-gray-600`) is a light-mode bug waiting for somebody's night shift.
`text-white` on a coloured chip is correct. The theme is written onto `<html>` before the
first paint by an inline script (`themeBootScript`), so there is no white flash on the way
in — do not move it to a component.

**3. A module declares what it shows AND what it watches for.** `ModuleManifest` carries
`signals` (figures for the department dashboard), `alerts` (things somebody needs to know
about now, for the topbar bell) and a `description` on every nav entry (the band above each
screen). All three live in the module, never in the spine — so deleting a module folder
takes its figures, its watches and its explanations with it, and `pnpm module-check` fails
the build if a visible nav entry has no description.

**Alerts are decided in code, never by a model.** Late is a date comparison; down is a row
with no end time. See the reasoning block above `ModuleAlert` in
`src/spine/registry/manifest.ts`. An alert wrong in the reassuring direction is worse than
no alert at all.

**4. The sign-in page is Keycloak's, and its JavaScript has a build step nothing runs for
you.** The revolving factory behind the login form lives in a Keycloak theme at
`infra/keycloak-themes/indcore`, mounted into the container by `infra/docker-compose.yml`
and selected by `"loginTheme": "indcore"` in the realm. Its two scripts are **built
artefacts**, committed because Keycloak reads the folder directly and there is no build step
between this repository and a running container:

```
pnpm --filter @ind-core/web build-login-theme
```

Editing `src/spine/void/floorplan-*.ts` or `login-*.ts` and not running that changes
nothing.

**The sign-in page has a light mode, and the theme crosses two origins by COOKIE.**
`localStorage` is scoped to an origin, so it cannot carry a choice between Keycloak (`:8080`)
and the app (`:3001`). A cookie is scoped to a HOST and ignores the port, so `xelor.theme`
(`light` | `dark` | `system`) is the shared record; `localStorage` is kept beside it only as
a fallback when cookies are refused. **In production on sibling subdomains this needs
`domain=.<registrable-domain>` at BOTH ends** — `theme.tsx` and `login-loader.ts`. Nothing
fails loudly when it is wrong; the theme just stops following people through the front door.

The loader is now 2.7 kB rather than 0.6 kB because it also does the pre-paint theme boot and
injects the appearance control. Both belong there rather than in the scene bundle: the boot
must run before the first paint or everyone on dark gets a white flash, and the scene bundle
is deliberately never fetched on a machine with no WebGL — which is exactly the machine most
likely to be in a bright plant office needing light mode.

**CSS needs no rebuild — but making it need no restart took a fix.** `start-dev` alone does
*not* make theme editing iterative, which this file previously claimed. Measured: an edited
stylesheet was still being served from the copy Keycloak read at boot, so a CSS change
looked like it had simply had no effect and a container restart was silently required.
`infra/docker-compose.yml` now passes `--spi-theme-static-max-age=-1
--spi-theme-cache-themes=false --spi-theme-cache-templates=false`, and with those three
flags `indcore.css` is genuinely live on reload. If a CSS change ever appears to do nothing
again, check those flags survived before debugging the CSS.

Two rules the theme depends on, both of which cost real time to find:

- **Nothing may be added to `scripts=` in `theme.properties` except the loader.** The parent
  template renders those tags without `defer`, in `<head>`, so anything named there blocks
  the form from painting. `backdrop-loader.js` is 0.6 kB and fetches the 493 kB scene
  asynchronously; pointing the property at `backdrop.js` puts half a megabyte in front of
  the username field.
- **The scene must never be able to make the page unresponsive.** On a machine with no GPU
  the bloom pass saturated the main thread so completely that the Sign In button stopped
  responding to clicks — measured, not theorised. `isSoftwareRenderer()` and the frame
  watchdog in `floorplan-scene.ts` exist for that, and the form is styled to be fully usable
  with the scene absent. Anything added to that scene inherits the same obligation.

## The demo data, and how to rebuild it

Two seeders, both driving the real API over HTTP. Nothing is INSERTed behind the
application's back, so a green run is evidence that the paths work rather than that Postgres
accepts rows.

| | |
|---|---|
| `pnpm demo:seed` | The §7 base world — masters, opening stock, three CP-50 orders, the platform console. **54 steps.** |
| `pnpm demo:northstar` | The investor story: Northstar Process Systems, 120 PX-400 pumps, followed through all seven departments. **81 steps.** |
| `pnpm demo:rebuild` | reset → migrate → both seeders. About a minute. |

`docs/02-investor-demo/01-presenter-walkthrough.md` is the presenter's walkthrough;
`docs/02-investor-demo/02-capability-gaps.md` records what the demo cannot show and why.
`apps/api/scripts/shared/demo-client.mjs` holds the plumbing both seeders share — token
exchange, the idempotent HTTP client, the step runner. Two copies of that drift, and the
symptom is a mysterious 401 halfway through a demo build.

**`demo:rebuild` rebuilds; it does not delete.** Fifty-four tables carry an append-only
trigger — `audit_log`, `stock_ledger`, `journal_voucher`, `workflow_action`, `payroll_run`,
the statutory rate tables — and those triggers fire for the schema owner too. A row-level
undo would have to start by dropping them, which is the one thing this system is sold on not
doing. `packages/db/src/demo-reset.ts` drops and recreates the `public` schema instead, then
replays `infra/postgres/init/00-init.sql` — **that replay is not optional**: the schema drop
takes `app_user`'s USAGE grant and the ALTER DEFAULT PRIVILEGES with it, and without them
migrations still succeed while every API call afterwards returns 500.

The reset **refuses on data, not on a name**: the `tenant` table must contain nothing but the
two §7 demo tenants. One real customer in there and it stops without touching a row. It also
requires `--yes`.

**The running API does NOT need restarting after a rebuild** — measured, not assumed. The
node-postgres pool reconnects and nothing caches a prepared statement by name, so the same
process served all 135 seeder steps against a schema that had been dropped and recreated
underneath it. (This is unlike `next build`, which genuinely does break a running
`next start`; see below.)

**The seeders must be run from Windows, or with `API_BASE` set.** They default to
`http://localhost:3000`, deliberately, not the dotted quad: the API is a *process* inside WSL
while Keycloak and Postgres are *containers* with published ports, and from Windows
`localhost:3000` reaches the WSL process while `127.0.0.1:3000` does not. The old default
failed at the first API call with a bare `fetch failed`, several steps after the token
exchange had succeeded against Keycloak on the same host.

Two browser probes check the parts a green seeder cannot:

```
node _scratch/probe-personas.mjs     # five personas: map, deep links, real-token 403s
node _scratch/probe-northstar.mjs    # every department screen actually renders the story
```

`probe-northstar.mjs` reads `main`, never `document.body` — the sidebar carries every module
name in the product, so a body-wide search passes on a page that rendered nothing.

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

**`next build` while that server is running BREAKS IT — always restart afterwards.** `next
start` reads the build once, at boot, and serves chunk filenames from it. Rebuilding replaces
`.next` underneath, so the running server keeps advertising hashes that no longer exist and
the client fetches 404s. The page still answers 200, so every health check passes; the app
simply never hydrates and sits on its loading state for ever.

That is the whole failure mode, and it does not look like itself: the first time it appeared
as an app stuck on "WAKING", the second as a browser harness timing out waiting for the
Keycloak login form that the app had never redirected to. Both cost real time chasing
authentication. **If the app hangs at boot right after a build, restart :3001 before
debugging anything else.**

Free the port first — `Get-NetTCPConnection -LocalPort 3001 -State Listen` then
`Stop-Process` — because Next fails with `EADDRINUSE` rather than taking the port over.

**Check all three before concluding anything is broken.** `web:200 · api:401 · kc:200` is
the healthy state; the API's 401 is the auth guard answering, not a fault.

Use these three URLs exactly — the API's global prefix is `api/v1`, so `/api/…` and `/` both
answer **404**, which looks like a dead service and is not one:

| | |
|---|---|
| web | `http://localhost:3001` → 200 |
| kc | `http://localhost:8080/realms/indcore/.well-known/openid-configuration` → 200 |
| api | `http://localhost:3000/api/v1/general/companies` → **401** |

## `pnpm` is not on PATH — reach it through corepack

There is no `pnpm` shim in `PATH` and `corepack enable` cannot create one (it writes to
`C:\Program Files\nodejs`, which needs admin). Corepack itself works, so prefix every
invocation:

```powershell
& "C:\Program Files\nodejs\corepack.cmd" pnpm --filter @ind-core/web build
```

A bare `pnpm …` fails with `CommandNotFoundException` in PowerShell and
`pnpm: command not found` in bash — neither of which says anything about the workspace.

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
