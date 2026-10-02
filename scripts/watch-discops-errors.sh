#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${1:-${BASE_DIR:-$HOME/discops}}"
INTERVAL="${INTERVAL:-15}"
STALE_SECONDS="${STALE_SECONDS:-120}"
STATUS_URL="${STATUS_URL:-http://127.0.0.1:8080/api/status}"
ALERT_LOG="${ALERT_LOG:-$BASE_DIR/data/backend/error-watch.alerts.log}"
RUN_LOG="${RUN_LOG:-$BASE_DIR/data/backend/error-watch.run.log}"
PID_FILE="${PID_FILE:-$BASE_DIR/data/backend/error-watch.pid}"
IGNORE_REGEX="${IGNORE_REGEX:-MODULE_TYPELESS_PACKAGE_JSON|DeprecationWarning: Calling start\(\) is no longer necessary}"
ERROR_REGEX="${ERROR_REGEX:-\berror\b|\bfailed\b|exception|traceback|panic|unhealthy|validation.*failed|publish.*failed|metadata.*fail|rip_failed|\bscsi\b|\bsg_[a-z0-9_]+\b|sense key|medium error|hardware error|illegal request|unit attention|not ready|i/?o error|buffer i/?o error}"

mkdir -p "$(dirname "$ALERT_LOG")"
touch "$ALERT_LOG" "$RUN_LOG"

log_run() {
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$RUN_LOG" >/dev/null
}

log_alert() {
  printf '[%s] ALERT %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$ALERT_LOG" "$RUN_LOG"
}

cleanup() {
  rm -f "$PID_FILE"
}
trap cleanup EXIT

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Watcher already running with PID $existing_pid" >&2
    exit 1
  fi
fi

echo "$BASHPID" > "$PID_FILE"
cd "$BASE_DIR"
log_run "starting watcher in $BASE_DIR interval=${INTERVAL}s stale=${STALE_SECONDS}s"

while true; do
  loop_started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  compose_ps="$(docker compose ps 2>&1 || true)"
  if grep -Eiq 'Exited|Dead|Restarting|unhealthy' <<<"$compose_ps"; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      if grep -Eiq 'Exited|Dead|Restarting|unhealthy' <<<"$line"; then
        log_alert "compose_ps $line"
      fi
    done <<<"$compose_ps"
  fi

  status_json="$(curl -fsS "$STATUS_URL" 2>/dev/null || true)"
  if [[ -z "$status_json" ]]; then
    log_alert "status endpoint unreachable: $STATUS_URL"
  else
    STATUS_JSON="$status_json" STALE_SECONDS="$STALE_SECONDS" python3 - <<'PY' | while IFS= read -r line; do [[ -n "$line" ]] && log_alert "$line"; done
import datetime as dt
import json
import os
import sys

raw = os.environ.get("STATUS_JSON", "")
stale_seconds = int(os.environ.get("STALE_SECONDS", "120"))
obj = json.loads(raw)

mb = obj.get("musicBrainz") or {}
if mb and not mb.get("ok", True):
    print(f"musicbrainz not ok status={mb.get('status')} latencyMs={mb.get('latencyMs')}")

now = dt.datetime.now(dt.timezone.utc)
for drive in obj.get("drives", []):
    rid = drive.get("ripperId") or drive.get("id") or "unknown"
    state = str(drive.get("state") or "")
    connected = drive.get("connected", True)
    tray = drive.get("trayStatus")
    media = drive.get("mediaPresent")
    last_seen = drive.get("lastSeenAt")

    if not connected:
        print(f"{rid} disconnected state={state} tray={tray} media={media}")

    lowered = state.lower()
    if lowered.startswith("failed") or lowered in {"error", "offline"}:
        print(f"{rid} bad-state state={state} tray={tray} media={media}")

    if last_seen:
        try:
            seen = dt.datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
            age = (now - seen).total_seconds()
            if age > stale_seconds:
                print(f"{rid} stale lastSeenAt={last_seen} ageSeconds={int(age)} state={state}")
        except Exception:
            print(f"{rid} invalid-lastSeenAt value={last_seen}")
PY
  fi

  recent_logs="$(docker compose logs --since="${INTERVAL}s" 2>&1 || true)"
  if [[ -n "$recent_logs" ]]; then
    filtered="$(printf '%s\n' "$recent_logs" | grep -Eai "$ERROR_REGEX" | grep -Eavi "$IGNORE_REGEX" || true)"
    if [[ -n "$filtered" ]]; then
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        log_alert "log $line"
      done <<<"$filtered"
    fi
  fi

  log_run "heartbeat loop_started=$loop_started"
  sleep "$INTERVAL"
done
