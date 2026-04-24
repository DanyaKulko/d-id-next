#!/bin/sh

apk add --no-cache curl

crontab -r || true

#echo "0 0 * * * curl -X POST -H \"Authorization: Bearer $CRON_SECRET\" \"$APP_BASE_URL/api/cron/external-sources\" >> /var/log/cron.log 2>&1" >> /etc/crontabs/root

echo "15 2 * * * curl -X POST -H \"Authorization: Bearer $CRON_SECRET\" -H \"Content-Type: application/json\" -d '{}' \"$APP_BASE_URL/api/cron/blog-media\" >> /var/log/cron.log 2>&1" >> /etc/crontabs/root

touch /var/log/cron.log

echo "Starting Cron Daemon..."
crond -f -l 2
