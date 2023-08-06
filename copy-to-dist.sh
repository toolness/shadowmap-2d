#! /usr/bin/env sh

rm -rf dist &&
mkdir dist &&
cp *.js *.html *.wgsl dist &&
mkdir -p dist/vendor/wgpu-matrix &&
cp vendor/wgpu-matrix/*.js dist/vendor/wgpu-matrix &&
echo "Done, files for distribution are now in 'dist'."
