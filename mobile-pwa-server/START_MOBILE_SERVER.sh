#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
export BACKEND_API_URL="${BACKEND_API_URL:-https://nightgram-production-0ceb.up.railway.app/api}"
export NEXT_PUBLIC_SOCKET_URL="${NEXT_PUBLIC_SOCKET_URL:-https://nightgram-production-0ceb.up.railway.app}"
echo "NightGram Mobile PWA 3.4.0: http://localhost:$PORT"
echo "Для звонков, установки и Web Push используйте доверенный HTTPS-домен."
exec node server.js
