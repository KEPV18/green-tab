#!/bin/bash
# Green Tab — One-time Google Sheet Login
# Run this ONCE to sign in to your work Google account.
# After that, the daily cron job will use the saved session.
#
# ⚠️  This will open a Chromium browser window.
# ⚠️  Sign in MANUALLY with your work account.
# ⚠️  Do NOT close the browser until you press ENTER in the terminal.

set -e
cd "$(dirname "$0")/.."

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Green Tab — Google Sheet Login                           ║"
echo "║                                                            ║"
echo "║  ⚠️  This opens a browser ONCE for you to sign in.         ║"
echo "║  ⚠️  Use your WORK Google account.                        ║"
echo "║  ⚠️  After signing in, press ENTER in this terminal.       ║"
echo "║  ⚠️  The session is saved. No more logins needed.          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Set display for Wayland
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/$(id -u)
export DISPLAY=:0

python3 scripts/fetch_team_data.py --login