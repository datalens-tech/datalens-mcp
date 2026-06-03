#!/bin/bash
cd "$(dirname "$0")"
npm ci --silent
npm run build --silent
node dist/index.js
