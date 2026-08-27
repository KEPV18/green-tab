#!/bin/bash
# Green Tab — Daily team data fetcher
# Run from cron or manually
# For cron: 0 8 * * * /mnt/ahmed/Projects/green-tab/scripts/daily-fetch.sh >> /tmp/green-tab-fetch.log 2>&1

set -e
cd "$(dirname "$0")/.."

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting daily fetch..." >> /tmp/green-tab-fetch.log

# Set display environment for headless browser
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DISPLAY=:0

python3 scripts/fetch_team_data.py "$@" >> /tmp/green-tab-fetch.log 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetch succeeded." >> /tmp/green-tab-fetch.log
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fetch FAILED with exit code $EXIT_CODE." >> /tmp/green-tab-fetch.log
fi

exit $EXIT_CODE