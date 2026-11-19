from pathlib import Path
import json,hashlib,urllib.request,sys,tarfile
root=Path(__file__).resolve().parent
dest=Path(sys.argv[1]);dest.mkdir(parents=True,exist_ok=True)
for item in json.loads((root/'ffmpeg-sources.json').read_text())['sources']:
    target=dest/item['file']
    if not target.exists():
        request=urllib.request.Request(item['url'],headers={'User-Agent':'MGU-Recorder-build'})
        with urllib.request.urlopen(request,timeout=120) as response:
            target.write_bytes(response.read())
    assert hashlib.sha256(target.read_bytes()).hexdigest()==item['sha256'],item['id']
    with tarfile.open(target) as archive:
        for member in archive:
            assert not member.name.startswith('/') and '..' not in Path(member.name).parts
    print('SOURCE_OK',item['id'],flush=True)
