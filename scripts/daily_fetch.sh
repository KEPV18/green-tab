#!/bin/bash
# Green Tab — Daily Dashboard Data Fetch
# Runs fetch_dashboard.py with Xvfb and Supabase credentials
# Called by qwenpaw cron daily at 08:00 Cairo time

set -e

# Start Xvfb if not running
if ! pgrep -f Xvfb > /dev/null; then
    Xvfb :99 -screen 0 1280x720x24 > /dev/null 2>&1 &
    sleep 2
fi

export DISPLAY=:99
export SUPABASE_URL="https://udbdvtcugpnrmtfipbzj.supabase.co"
export SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYmR2dGN1Z3Bucm10ZmlwYnpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODMxNjg1NywiZXhwIjoyMDkzODkyODU3fQ.0BsAPz9sdAZHB9ac5F-mdaWM89nCu2lqAv61kfa14vM"

cd /mnt/ahmed/Projects/green-tab

python3 scripts/fetch_dashboard.py --fetch --upload 2>&1