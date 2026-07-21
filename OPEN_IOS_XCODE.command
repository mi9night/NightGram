#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -f .env.native ]; then cp .env.native.example .env.native; fi
npm ci
npm run native:sync
npx cap open ios
