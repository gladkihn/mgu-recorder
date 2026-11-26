"""Reuse the unchanged, published glibc-2.17 runtime, then rebuild our new helpers."""
from pathlib import Path
import hashlib, io, json, tarfile, urllib.request

R = Path(__file__).resolve().parent.parent
BASE = 'https://github.com/gladkihn/mgu-recorder/releases/download/catalog/'
NAME = 'owner-dvr@4.3.4.tgz'
SHA = '7f5b21ca30f938aa501ad4e580bde64eecbfd5fe05f0ba7156138282606567de'
data = urllib.request.urlopen(BASE + NAME, timeout=120).read()
assert hashlib.sha256(data).hexdigest() == SHA, 'Published runtime package changed'
with tarfile.open(fileobj=io.BytesIO(data)) as t:
    component = json.load(t.extractfile('component.json'))
    for f in component['files']:
        name = f['path']
        if not (name.startswith('runtime/') or name in ['native/dvr-io', 'native/observer', 'native/mfx-codec']):
            continue
        assert not name.startswith('/') and '..' not in name.split('/')
        b = t.extractfile('files/' + name).read()
        assert hashlib.sha256(b).hexdigest() == f['sha256'], name
        out = R / 'recorder' / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b)
        out.chmod(int(f['mode'], 8))
dest = R / 'dist' / 'ffmpeg-sources-7.1.5-mgu1.tar.xz'
dest.parent.mkdir(exist_ok=True)
sources = urllib.request.urlopen(BASE + dest.name, timeout=120).read()
assert hashlib.sha256(sources).hexdigest() == 'eba8866e12c9e5fb06530402535c7df2fd4d5f817a5a38b8bc1cf82b40ad2bfa', 'Published FFmpeg sources changed'
dest.write_bytes(sources)
