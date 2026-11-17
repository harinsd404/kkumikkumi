#!/bin/sh
set -eu
# systemd supplies the public IP and state directory through EnvironmentFile.
cd "$(dirname "$0")"
docker compose run --rm certbot renew --quiet
# IP certificates are short-lived; load renewed files without interrupting clients.
docker compose exec -T gateway nginx -t
docker compose exec -T gateway nginx -s reload
