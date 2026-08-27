#!/bin/bash
# Green Tab — Daily team data fetcher
# Run this from a terminal with X11/Wayland display access
# For cron, use: xvfb-run python3 scripts/fetch_team_data.py

cd "$(dirname "$0")/.."
python3 scripts/fetch_team_data.py "$@"
