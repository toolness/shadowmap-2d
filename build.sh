#! /usr/bin/env sh

rm -rf dist &&
npm run build-js &&
mkdir dist &&
cp *.js *.html *.wgsl dist &&
mkdir -p dist/vendor/wgpu-matrix &&
cp vendor/wgpu-matrix/*.js dist/vendor/wgpu-matrix &&
echo "Done, built files are now in 'dist'."
