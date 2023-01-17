#!/bin/bash

set -e

echo "Cleaning dist dir..."

rimraf dist
mkdir dist

echo "Building lib..."

vite build --config ./vite.config.js

echo "Generating types..."
tsc -p ./tsconfig.json

echo "Copied package.json to dist"
cp ./package.json ./dist/package.json

exit 0;
