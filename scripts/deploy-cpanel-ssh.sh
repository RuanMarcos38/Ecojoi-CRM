#!/usr/bin/env bash
set -euo pipefail
umask 077

revision=${1:?Missing release revision}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
app="$HOME/repositories/Ecojoi-CRM"
state="$HOME/repositories/.ecojoi-crm-releases"
[[ "$(id -un)" == ecojoi && "$(realpath "$app")" == /home/ecojoi/repositories/Ecojoi-CRM ]]
test -f "$app/server.js"
test -d "$app/runtime"
mkdir -p "$state" "$app/tmp"
exec 9>"$state/deploy.lock"
flock -n 9

probe_token_file="$state/health-probe-token"
if [[ ! -s "$probe_token_file" ]]; then
  openssl rand -hex 32 > "$probe_token_file"
fi
chmod 600 "$probe_token_file"
probe_token=$(cat "$probe_token_file")
[[ "$probe_token" =~ ^[0-9a-f]{64}$ ]]

stage=$(mktemp -d "$state/stage.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
tar --no-same-owner -xzf - -C "$stage"
test "$(cat "$stage/DEPLOY_SOURCE_SHA")" = "$revision"
test -f "$stage/server.js"
test -f "$stage/runtime/server.js"
test -s "$stage/runtime/.next/BUILD_ID"

backup=$(mktemp -d "$state/rollback.XXXXXXXX")
cp -p -- "$app/server.js" "$backup/server.js"
if [[ -f "$app/DEPLOY_SOURCE_SHA" ]]; then
  cp -p -- "$app/DEPLOY_SOURCE_SHA" "$backup/DEPLOY_SOURCE_SHA"
fi

retire_runtime() {
  local runtime="$1" proc cwd name
  for proc in /proc/[0-9]*; do
    [[ -O "$proc" ]] || continue
    cwd=$(readlink "$proc/cwd" 2>/dev/null) || continue
    [[ "$cwd" == "$runtime" ]] || continue
    read -r name < "$proc/comm" || continue
    [[ "$name" == next-server* ]] || continue
    kill -TERM "${proc##*/}" 2>/dev/null || true
  done
}

rollback() {
  status=$?
  trap - ERR INT TERM
  if [[ -d "$backup/runtime" ]]; then
    if [[ -d "$app/runtime" ]]; then
      mv -- "$app/runtime" "$stage/failed-runtime"
    fi
    mv -- "$backup/runtime" "$app/runtime"
    cp -p -- "$backup/server.js" "$app/server.js"
    if [[ -f "$backup/DEPLOY_SOURCE_SHA" ]]; then
      cp -p -- "$backup/DEPLOY_SOURCE_SHA" "$app/DEPLOY_SOURCE_SHA"
    else
      rm -f -- "$app/DEPLOY_SOURCE_SHA"
    fi
    touch "$app/tmp/restart.txt"
    retire_runtime "$stage/failed-runtime"
  fi
  echo "Deploy interrompido. Backup: $backup" >&2
  exit "$(( status == 0 ? 1 : status ))"
}

trap rollback ERR INT TERM
mv -- "$app/runtime" "$backup/runtime"
mv -- "$stage/runtime" "$app/runtime"
mv -- "$stage/server.js" "$app/server.js"
mv -- "$stage/DEPLOY_SOURCE_SHA" "$app/DEPLOY_SOURCE_SHA"
touch "$app/tmp/restart.txt"
retire_runtime "$backup/runtime"

healthy() {
  local attempt response
  for attempt in {1..9}; do
    if response=$(curl -fsS --user-agent "Mozilla/5.0 (compatible; EcojoiCRMDeploy/1.0)" --max-time 15 \
      --config - https://crm.ecojoi.com.br/api/health <<< "header = \"x-ecojoi-health-probe: $probe_token\"") &&
      grep -Fq '"status":"ok"' <<< "$response" &&
      grep -Fq "\"revision\":\"$revision\"" <<< "$response"; then
      return 0
    fi
    if (( attempt < 9 )); then
      sleep 4
    fi
  done
  return 1
}
healthy || rollback
trap - ERR INT TERM
echo "Revisão $revision aplicada. Backup do aplicativo: $backup"
