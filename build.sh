#!/bin/sh
set -e
npx @opennextjs/cloudflare build
cp .open-next/cloudflare-templates/worker.js .open-next/_worker.js
