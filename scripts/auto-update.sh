#!/bin/sh
# Poll the checked-out branch, fast-forward to it, and rebuild the app and the
# voice bridge through the host's Docker daemon.
#
# The repository is mounted at the same absolute path inside this container as
# it has on the host (HOST_PROJECT_DIR), so the build contexts `docker compose`
# sends to the daemon point at the real files.
set -eu

APP_DIR="${APP_DIR:-/repo}"
HOST_PROJECT_DIR="${HOST_PROJECT_DIR:?HOST_PROJECT_DIR must be the repository path on the host}"
GIT_BRANCH="${GIT_BRANCH:-}"
UPDATE_INTERVAL="${UPDATE_INTERVAL:-300}"

log() {
  echo "[auto-update $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
cd "$APP_DIR"

if [ -z "$GIT_BRANCH" ]; then
  GIT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || echo master)"
fi

log "watching origin/$GIT_BRANCH in $APP_DIR every ${UPDATE_INTERVAL}s"

while true; do
  if git fetch --quiet origin "$GIT_BRANCH"; then
    local_rev="$(git rev-parse HEAD)"
    remote_rev="$(git rev-parse "origin/$GIT_BRANCH")"

    if [ "$local_rev" != "$remote_rev" ]; then
      log "new commit on origin/$GIT_BRANCH, fast-forwarding"
      if git merge --ff-only "origin/$GIT_BRANCH"; then
        log "rebuilding and restarting app + bridge"
        if docker compose \
          --project-directory "$HOST_PROJECT_DIR" \
          -f "$HOST_PROJECT_DIR/docker-compose.yml" \
          up -d --build app bridge; then
          log "deployed $(git rev-parse --short HEAD)"
        else
          log "deploy failed; the next check will retry"
        fi
      else
        log "not a fast-forward (local changes?); skipping this round"
      fi
    fi
  else
    log "git fetch failed; the next check will retry"
  fi

  sleep "$UPDATE_INTERVAL"
done
