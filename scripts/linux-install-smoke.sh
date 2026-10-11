#!/usr/bin/env bash
# Installs the deb, starts the app on a virtual display with disposable data
# directories and checks that it stays up and creates its SQLite database.
set -euo pipefail
# Like the Windows smoke, this refuses personal workstations: it installs a
# system package. GitHub-hosted runners are disposable.
if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo 'Install smoke requires a disposable GitHub-hosted Linux runner.' >&2
  exit 1
fi
if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo 'Expected exactly one deb package.' >&2
  exit 1
fi
sudo apt-get install -y "$(realpath "$1")"
smoke_root="$RUNNER_TEMP/draftsim-install-smoke"
mkdir -p "$smoke_root"
export XDG_DATA_HOME="$smoke_root/data" XDG_CONFIG_HOME="$smoke_root/config" XDG_CACHE_HOME="$smoke_root/cache"
database="$XDG_DATA_HOME/app.draftsim.desktop/draftsim.db"
# Runners have no GPU; keep WebKitGTK on its software path.
export WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1
xvfb-run -a draftsim > "$smoke_root/app.txt" 2>&1 &
app=$!
trap 'kill "$app" 2>/dev/null || true' EXIT
for _ in $(seq 60); do
  sleep 1
  if ! kill -0 "$app" 2>/dev/null; then
    cat "$smoke_root/app.txt" >&2
    echo 'Application exited during startup.' >&2
    exit 1
  fi
  [[ -f "$database" ]] && break
done
if [[ ! -f "$database" ]]; then
  cat "$smoke_root/app.txt" >&2
  echo 'Application did not create its database.' >&2
  exit 1
fi
# Let first-run hydration finish its writes before reading the schema marker.
sleep 5
kill -0 "$app" 2>/dev/null || { cat "$smoke_root/app.txt" >&2; echo 'Application exited after startup.' >&2; exit 1; }
python3 - "$database" <<'PY'
import sqlite3, sys
with sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True) as db:
    assert db.execute("pragma integrity_check").fetchone()[0] == "ok"
    assert db.execute("select value from schema_meta where key='persist_version'").fetchone() == ("8",)
print("First-run database verified")
PY
