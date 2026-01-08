#!/bin/sh
set -eu

CRON_SCHEDULE="${EXTERNAL_SOURCES_CRON:-${EXTERNAL_TEXT_CRON:-0 2 * * *}}"

echo "Using schedule: ${CRON_SCHEDULE}"

cat <<EOF > /etc/crontabs/root
APP_BASE_URL=${APP_BASE_URL:-}
CRON_SECRET=${CRON_SECRET:-}
EXTERNAL_TEXT_CRON=${EXTERNAL_TEXT_CRON:-}
EXTERNAL_VIDEO_CRON=${EXTERNAL_VIDEO_CRON:-}
EXTERNAL_SOURCES_CRON=${EXTERNAL_SOURCES_CRON:-}

${CRON_SCHEDULE} node /app/scripts/cron-sync-external-sources.js >> /var/log/cron.log 2>&1
EOF

crond -f -l 2
