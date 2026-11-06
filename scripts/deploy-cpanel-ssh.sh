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

healthy() {
  curl -fsS --retry 8 --retry-all-errors --retry-delay 4 --max-time 15 \
    https://crm.ecojoi.com.br/api/health | grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"'
}
healthy
trap - ERR INT TERM
echo "Revisão $revision aplicada. Backup do aplicativo: $backup"
