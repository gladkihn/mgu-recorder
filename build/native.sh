#!/usr/bin/env bash
set -euo pipefail
repo_root=$(cd "$(dirname "$0")/.." && pwd)
for name in mfx-compose mfx-preview; do
  cc -O2 -march=x86-64 -std=gnu11 "$repo_root/recorder/native/$name.c" -o "$repo_root/recorder/native/$name" -ldl
done
cc -O2 -march=x86-64 -std=gnu11 "$repo_root/recorder/native/nv-feed.c" -o "$repo_root/recorder/native/nv-feed"
cc -O2 -march=x86-64 -std=gnu11 -shared -fPIC "$repo_root/recorder/native/nv-tap.c" -o "$repo_root/recorder/native/nv-tap.so" -pthread
strip "$repo_root/recorder/native/mfx-compose" "$repo_root/recorder/native/mfx-preview" "$repo_root/recorder/native/nv-feed" "$repo_root/recorder/native/nv-tap.so"
