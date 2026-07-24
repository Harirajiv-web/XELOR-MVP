# IND-CORE MVP prototype — environment notes

## Docker is installed (inside WSL, not on Windows)

Docker Desktop is **not** installed (it needs admin, which this machine lacks). Instead, **Docker Engine runs inside a WSL2 Ubuntu distro**. There is no `C:\Program Files\Docker`. Access Docker by prefixing commands with `wsl -d Ubuntu -u root -e`:

```powershell
wsl -d Ubuntu -u root -e docker ps
wsl -d Ubuntu -u root -e docker compose version
```

- The daemon **auto-starts** via systemd on WSL boot; Docker data lives at `/var/lib/docker` inside WSL.
- Verify it exists with: `wsl -d Ubuntu -u root -e docker version`

### Windows cannot reach container ports on localhost

The Hyper-V firewall blocks host→WSL inbound (`DefaultInboundAction=Block`), and opening it needs admin. So **anything that talks to a container must run from inside WSL** against `127.0.0.1`, not from Windows against `localhost`.

Bring up Postgres:
```powershell
wsl -d Ubuntu -u root -e sh -c "cd '/mnt/e/ERP/MVP FILES/MVP_PROTOTYPE_1' && docker compose -f infra/docker-compose.yml up -d postgres"
```

## Running the DB-gated proofs

The proofs (`db:migrate`, `db:rls-check`, the two-tenant RLS leak probe) run **inside WSL** from a copy at `/root/proj` (Linux-native `node_modules` — do **not** reuse the Windows `node_modules` on `/mnt/e`). They read `DATABASE_URL` / `DATABASE_OWNER_URL` from env directly (no dotenv), pointed at `127.0.0.1:5432`:

- `DATABASE_URL=postgres://app_user:app_pw@127.0.0.1:5432/indcore`
- `DATABASE_OWNER_URL=postgres://indcore_owner:owner_pw@127.0.0.1:5432/indcore`

`/root/proj` is a **copy**; after editing source under `E:\...`, re-copy (tar excluding `node_modules`/`.git`/`dist`) before re-running.
