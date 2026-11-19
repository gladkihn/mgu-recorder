#!/usr/bin/env bash
set -euo pipefail
repo_root=$(cd "$(dirname "$0")/.." && pwd)
build_root="$repo_root/.build"
prefix="$build_root/prefix"
mkdir -p "$build_root/sources" "$build_root/src" "$prefix" "$repo_root/dist"
export PATH="/opt/python/cp311-cp311/bin:$prefix/bin:$PATH"
python -m pip install --disable-pip-version-check meson==1.3.2 ninja==1.11.1.1
python "$repo_root/build/fetch.py" "$build_root/sources"
export PKG_CONFIG_PATH="$prefix/lib/pkgconfig"
export CFLAGS='-O2 -march=x86-64 -mtune=generic -fPIC'
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-L$prefix/lib -static-libgcc -static-libstdc++"
jobs=${BUILD_JOBS:-2}
unpack(){
    mkdir -p "$build_root/src/$1"
    tar -xf "$build_root/sources/$2" -C "$build_root/src/$1" --strip-components=1
    cd "$build_root/src/$1"
}
unpack nasm nasm-2.16.03.tar.xz
./configure --prefix="$prefix"
make -j"$jobs" && make install
unpack freetype freetype-2.13.3.tar.xz
./configure --prefix="$prefix" --enable-static --disable-shared --without-zlib --without-bzip2 --without-png --without-brotli --without-harfbuzz
make -j"$jobs" && make install
unpack fribidi fribidi-1.0.16.tar.xz
meson setup out --prefix="$prefix" --libdir=lib --default-library=static --buildtype=release -Ddocs=false -Dtests=false -Dbin=false
meson compile -C out -j"$jobs" && meson install -C out
unpack harfbuzz harfbuzz-10.4.0.tar.xz
meson setup out --prefix="$prefix" --libdir=lib --default-library=static --buildtype=release -Dglib=disabled -Dgobject=disabled -Dcairo=disabled -Dchafa=disabled -Dicu=disabled -Dgraphite2=disabled -Dfreetype=enabled -Ddocs=disabled -Dtests=disabled -Dintrospection=disabled -Dutilities=disabled
meson compile -C out -j"$jobs" && meson install -C out
unpack libass libass-0.17.3.tar.xz
./configure --prefix="$prefix" --enable-static --disable-shared --disable-fontconfig --disable-libunibreak --disable-require-system-font-provider
make -j"$jobs" && make install
unpack x264 x264-stable.tar.gz
./configure --prefix="$prefix" --libdir="$prefix/lib" --enable-static --disable-cli --enable-pic --bit-depth=8 --chroma-format=420
make -j"$jobs" && make install
unpack ffmpeg ffmpeg-7.1.5.tar.xz
./configure --prefix="$prefix" --pkg-config-flags=--static --extra-cflags="-I$prefix/include $CFLAGS" --extra-ldflags="$LDFLAGS" --extra-libs='-Wl,-Bstatic -lstdc++ -Wl,-Bdynamic -lpthread -lm' --enable-gpl --enable-version3 --enable-static --disable-shared --disable-debug --disable-doc --disable-autodetect --disable-network --disable-everything --enable-ffmpeg --disable-ffplay --disable-ffprobe --enable-libx264 --enable-libass --enable-swscale --enable-protocol=file,pipe --enable-demuxer=mpegts,h264,rawvideo,mov --enable-muxer=rawvideo,mp4,mpegts,h264 --enable-decoder=h264,rawvideo --enable-encoder=libx264,rawvideo --enable-parser=h264 --enable-bsf=h264_mp4toannexb,extract_extradata --enable-filter=buffer,buffersink,scale,format,null,fps,tpad,ass
make -j"$jobs"
install -m755 ffmpeg "$repo_root/recorder/runtime/ffmpeg"
./ffmpeg -version > "$repo_root/recorder/runtime/FFMPEG-CONFIGURATION.txt"
mkdir -p "$repo_root/recorder/runtime/licenses"
cp COPYING.GPLv3 "$repo_root/recorder/runtime/licenses/FFmpeg.GPLv3"
cp "$build_root/src/x264/COPYING" "$repo_root/recorder/runtime/licenses/x264.GPLv2"
cp "$build_root/src/libass/COPYING" "$repo_root/recorder/runtime/licenses/libass.ISC"
cp "$build_root/src/harfbuzz/COPYING" "$repo_root/recorder/runtime/licenses/harfbuzz.MIT"
cp "$build_root/src/fribidi/COPYING" "$repo_root/recorder/runtime/licenses/fribidi.LGPL"
cp "$build_root/src/freetype/docs/FTL.TXT" "$repo_root/recorder/runtime/licenses/freetype.FTL"
cp "$build_root/src/freetype/LICENSE.TXT" "$repo_root/recorder/runtime/licenses/freetype.LICENSE"
cc -O2 -march=x86-64 -std=gnu11 "$repo_root/recorder/native/dvr-io.c" -o "$repo_root/recorder/native/dvr-io"
cc -O2 -march=x86-64 -std=gnu11 "$repo_root/recorder/native/observer.c" -o "$repo_root/recorder/native/observer" -ldl -pthread
cc -O2 -march=x86-64 -std=gnu11 "$repo_root/recorder/native/mfx-codec.c" -o "$repo_root/recorder/native/mfx-codec" -ldl
strip "$repo_root/recorder/runtime/ffmpeg" "$repo_root/recorder/native/dvr-io" "$repo_root/recorder/native/observer" "$repo_root/recorder/native/mfx-codec"
cd "$repo_root"
python - <<'PY'
import json,hashlib,subprocess,platform
from pathlib import Path
p=Path('recorder/runtime/ffmpeg')
v={'version':'7.1.5','sourceLock':'build/ffmpeg-sources.json','ffmpegSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'builtFromPublishedSources':True,'sourceArchive':'https://github.com/gladkihn/mgu-recorder/releases/download/catalog/ffmpeg-sources-7.1.5.tar.xz','target':'Linux x86_64 glibc 2.17','compiler':subprocess.check_output(['cc','--version'],text=True).splitlines()[0]}
Path('recorder/runtime/FFMPEG-SOURCE.json').write_text(json.dumps(v,indent=2)+'\n')
PY
