#!/usr/bin/env bash
#
# Start one phase, and only one.
#
#   ./run-phase.sh 1        ONYX  by AIKYANTRA — the ERP as it stood on 10 Aug 2026, frozen
#   ./run-phase.sh 2        XELOR by AIKYANTRA — the autonomous-fulfilment upgrade
#   ./run-phase.sh stop     stop both
#
#   ./run-phase.sh 2 --keep  start WITHOUT rebuilding the demo world
#
# EVERY START REBUILDS THE DEMO WORLD unless --keep is passed. The world is dropped,
# migrated and re-seeded, so each launch opens on identical numbers: same document
# series, same stock, same nine scenarios all available. A demo shown twice from a
# world that drifted between showings is the fastest way to lose an audience.
#
# The two phases share Keycloak, Valkey and Gotenberg, because none of those hold
# phase-specific state. They do NOT share a database or a port: phase 2 runs migrations
# that phase 1 has never seen, and a shared database would mean starting phase 2 once
# silently rewrote phase 1 into something that no longer matches its own code.
#
#   phase 1 -> api :3000  web :3001  db indcore
#   phase 2 -> api :3100  web :3101  db indcore_p2
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  1) DIR="$HERE/ONYX-phase-1"; API_PORT=3000; WEB_PORT=3001; LABEL="PHASE 1 · ONYX by AIKYANTRA — the ERP as it was" ;;
  2) DIR="$HERE/XELOR-phase-2"; API_PORT=3100; WEB_PORT=3101; LABEL="PHASE 2 · XELOR by AIKYANTRA — autonomous fulfilment" ;;
  stop)
    for p in 3000 3001 3100 3101; do
      pids=$(lsof -ti :$p 2>/dev/null || true)
      [ -n "$pids" ] && kill $pids 2>/dev/null && echo "stopped :$p" || true
    done
    exit 0 ;;
  *) echo "usage: $0 {1|2|stop} [--keep]" >&2; exit 2 ;;
esac

[ -d "$DIR" ] || { echo "no such phase directory: $DIR" >&2; exit 1; }

# Fresh by default. `--keep` is the escape hatch for when you are mid-investigation and
# the current state IS the thing you are looking at.
REBUILD=1
[ "${2:-}" = "--keep" ] && REBUILD=0

echo "── $LABEL"

# Shared infrastructure. Bringing it up is idempotent; it is already running most of the
# time, and `up -d` on a healthy stack is a no-op rather than a restart.
#
# `docker compose` (the plugin subcommand) is NOT installed on this machine — only the
# standalone `docker-compose` binary is. This line used to say `docker compose` and was
# wrapped in `|| true`, so for the whole life of the script it silently did nothing and the
# containers survived only because somebody had started them by hand months earlier. The
# symptom of that is the worst kind: everything works until the day the stack is not already
# up, and then the failure is a database refusing connections rather than a missing tool.
COMPOSE=""
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then COMPOSE="docker-compose"
fi
#
# ONE canonical compose file, NOT "$DIR/infra/…". The two phases carry byte-identical
# compose files under the same project name, so either could start the stack — but compose
# keys a container's identity partly on the config path it was created from, so alternating
# `./run-phase.sh 1` and `./run-phase.sh 2` made every launch RECREATE postgres and keycloak.
# Measured, and the damage is not obvious: restarting postgres under a running API kills it,
# because pg-pool raises the idle client's "terminating connection due to administrator
# command" as an unhandled error event. Starting phase 1 would silently take phase 2's API
# down. Pinning the path makes `up -d` the no-op it was always supposed to be.
INFRA="$HERE/XELOR-phase-2/infra/docker-compose.yml"
if [ -n "$COMPOSE" ]; then
  $COMPOSE -f "$INFRA" up -d >/dev/null 2>&1 || true
else
  echo "   no docker compose on PATH — assuming the shared stack is already up" >&2
fi

# Free the ports first. Next fails with EADDRINUSE rather than taking a port over, and the
# resulting error names the port but not the process still holding it.
for p in $API_PORT $WEB_PORT; do
  pids=$(lsof -ti :$p 2>/dev/null || true)
  [ -n "$pids" ] && { kill $pids 2>/dev/null || true; sleep 1; }
done

mkdir -p "$DIR/.run"

# THE SCHEMA HALF OF THE REBUILD, AND IT HAS TO HAPPEN HERE — with the ports freed above
# and the API not yet started. Dropping the public schema underneath a live API leaves its
# connection pool holding sessions bound to objects that no longer exist; the API keeps
# answering and the writes go nowhere. That failure looks like a seeding bug for about an
# hour before you find it.
if [ "$REBUILD" = "1" ]; then
  echo "   rebuilding the demo world (drop → migrate)"
  ( cd "$DIR" && pnpm db:demo-reset --yes && pnpm db:migrate ) >"$DIR/.run/rebuild.log" 2>&1 || {
    echo "   ✗ schema rebuild failed — see $DIR/.run/rebuild.log" >&2; exit 1; }
fi

( cd "$DIR/apps/api" && node --env-file-if-exists=../../.env dist/src/main.js \
    >"$DIR/.run/api.log" 2>&1 & echo $! >"$DIR/.run/api.pid" )

# The web app proxies /api/v1 to NEXT_PUBLIC_API_ORIGIN (see apps/web/next.config.ts) and
# defaults to :3000 when it is unset. For phase 2 that default is PHASE-1's API — which
# answers, and has no /fulfilment routes, so the browser gets a clean 401 and the screen
# reports a technical error while every direct curl against :3100 passes.
#
# Passed here as well as living in .env so the two phases cannot cross-wire even if a .env
# is edited or copied between them.
( cd "$DIR/apps/web" && PORT=$WEB_PORT NEXT_PUBLIC_API_ORIGIN="http://localhost:$API_PORT" \
    node scripts/run-next.mjs start \
    >"$DIR/.run/web.log" 2>&1 & echo $! >"$DIR/.run/web.pid" )

# Wait for readiness rather than sleeping a guessed number of seconds. A port that is not
# answering four seconds after launch has told you nothing — this repository has burned
# real time on exactly that mistake, concluding a firewall was blocking a service that
# simply had not finished starting.
echo -n "   waiting"
for _ in $(seq 1 40); do
  # `curl -w '%{http_code}'` already prints 000 when it cannot connect. Appending
  # `|| echo 000` printed a SECOND one, so a dead API read as "000000" — which is not
  # equal to "000", so the loop below broke on the first pass and announced a service
  # that had not started. Let curl speak once.
  web=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$WEB_PORT" 2>/dev/null) || true
  api=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$API_PORT/api/v1/general/companies" 2>/dev/null) || true
  [ "$web" = "200" ] && [ "$api" != "000" ] && break
  echo -n "."; sleep 1
done
echo

# THE SEEDING HALF, which has to be here because it goes through the running API rather
# than into the database — that is the point, the demo world is built by the same
# endpoints a user drives.
#
# API_BASE AND WEB_BASE ARE PINNED, deliberately and redundantly. The scripts default to
# this phase's ports now, but a launcher that relies on a default in a file it does not
# own is one careless copy away from seeding the other phase. That exact mistake — running
# a rebuild inside PHASE-2 which dropped PHASE-2 and then seeded PHASE-1 through :3000 —
# is why this line is explicit.
seed_world() {
  : >"$DIR/.run/rebuild-seed.log"
  ( cd "$DIR" && API_BASE="http://localhost:$API_PORT" WEB_BASE="http://localhost:$WEB_PORT" \
      pnpm demo:seed && API_BASE="http://localhost:$API_PORT" WEB_BASE="http://localhost:$WEB_PORT" \
      pnpm demo:northstar ) >>"$DIR/.run/rebuild-seed.log" 2>&1 || true
  SEED_OK=$(grep -oE '[0-9]+ step\(s\) ok' "$DIR/.run/rebuild-seed.log" | awk '{s+=$1} END{print s+0}')
  SEED_BAD=$(grep -oE '[0-9]+ failed' "$DIR/.run/rebuild-seed.log" | awk '{s+=$1} END{print s+0}')
  cat "$DIR/.run/rebuild-seed.log" >>"$DIR/.run/rebuild.log"
}

if [ "$REBUILD" = "1" ] && [ "$web" = "200" ]; then
  echo -n "   seeding the demo world"
  seed_world
  # RETRY ONCE, AND ONLY FOR THE REASON THAT ACTUALLY RECURS. The seeder authenticates
  # against Keycloak; when Keycloak is still settling, calls come back 401
  # "Token verification failed" and the world is left half-built — 23 steps in, on one
  # measured run, out of 157. That is a demo missing its work orders and its inspection,
  # discovered on stage. A fresh token on a settled Keycloak fixes it, so try again once.
  # A seeder that ABORTS reports no counts at all, so `SEED_BAD` is 0 and the old condition
  # — which required a non-zero failure count — could never fire for the worst outcome there
  # is. Measured: recreating the containers left Keycloak a few seconds from listening, the
  # token exchange died with a bare `fetch failed`, the seeder aborted at step 0, and this
  # script printed "seeding the demo world" and then simply stopped, with an EMPTY world and
  # no error on screen. Retry on the abort as well as on the auth failure.
  SEED_ABORTED=0
  grep -qE "seeder aborted|fetch failed|ECONNREFUSED" "$DIR/.run/rebuild-seed.log" && SEED_ABORTED=1
  if { [ "$SEED_BAD" != "0" ] && grep -q "UNAUTHENTICATED" "$DIR/.run/rebuild-seed.log"; } \
     || [ "$SEED_ABORTED" = "1" ]; then
    if [ "$SEED_ABORTED" = "1" ]; then
      echo -n " — the seeder could not reach the stack, re-seeding once"
    else
      echo -n " — $SEED_BAD auth failure(s), re-seeding once"
    fi
    ( cd "$DIR" && pnpm db:demo-reset --yes && pnpm db:migrate ) >>"$DIR/.run/rebuild.log" 2>&1 || true
    sleep 3
    seed_world
  fi
  if [ "$SEED_OK" = "0" ]; then
    # NOT the same as "0 failed". No counts at all means the seeder never got going, and
    # saying "all ok" about an empty world is the one lie this script must not tell.
    echo " — the seeder never ran. The world is EMPTY."
    tail -6 "$DIR/.run/rebuild-seed.log" | sed 's/^/     /'
    echo "     full log: $DIR/.run/rebuild.log"
  elif [ "$SEED_BAD" = "0" ]; then
    echo " — $SEED_OK step(s), all ok"
  else
    # Reported, never swallowed. A seeding step that failed is a part of the demo that
    # will not be there, and finding that out on stage is the whole thing this avoids.
    echo " — $SEED_OK ok, $SEED_BAD FAILED"
    grep -E "^\s+FAIL" "$DIR/.run/rebuild-seed.log" | sed 's/^/     /' | head -8
    echo "     full log: $DIR/.run/rebuild.log"
  fi
fi

kc=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/realms/indcore/.well-known/openid-configuration 2>/dev/null) || true
echo "   web:$web  api:$api  kc:$kc"
# api 401 is the healthy answer: the auth guard responding, not a fault.
[ "$web" = "200" ] && echo "   → http://localhost:$WEB_PORT" || echo "   web did not come up; see $DIR/.run/web.log"
