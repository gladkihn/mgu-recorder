from pathlib import Path
import argparse,hashlib,json,shutil,zipfile
R=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',type=Path,required=True);p.add_argument('--artifacts',type=Path,required=True);p.add_argument('--nuget',type=Path,required=True);a=p.parse_args()
expected=json.loads((R/'recorder/runtime/FFMPEG-SOURCE.json').read_text())['ffmpegSha256']
if hashlib.sha256(a.ffmpeg.read_bytes()).hexdigest()!=expected:raise ValueError('FFmpeg differs from recorded provenance; review licenses and update FFMPEG-SOURCE.json before building')
shutil.copy2(a.ffmpeg,R/'recorder/runtime/ffmpeg')
V=R/'installer/vendor';V.mkdir(parents=True,exist_ok=True)
for f in a.artifacts.glob('*.tgz'):shutil.copy2(f,V/f.name)
for f in a.nuget.glob('*.nupkg'):
 dst=V/'packages'/f.stem;dst.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(f) as z:
  if any(m.filename.startswith('/') or '..' in Path(m.filename).parts for m in z.infolist()):raise ValueError('Unsafe package')
  z.extractall(dst)
print('Offline build inputs prepared; no vehicle accessed.')
