#!/bin/sh

set -eu

export OPENCLAW_UPSTREAM_HOST="${OPENCLAW_UPSTREAM_HOST:-host.docker.internal}"
export OPENCLAW_UPSTREAM_PORT="${OPENCLAW_UPSTREAM_PORT:-18789}"

envsubst '${OPENCLAW_UPSTREAM_HOST} ${OPENCLAW_UPSTREAM_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
