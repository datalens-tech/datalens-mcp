#!/bin/bash
cd "$(dirname "$0")"
npm install --silent
npm run build --silent
node dist/index.js