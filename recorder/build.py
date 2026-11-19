"""Build current-MGU Store artifacts without vehicle access or SDK redistribution."""
from pathlib import Path
import json,tarfile,io,hashlib,shutil,subprocess,os,sys
P=Path(__file__).resolve().parent;D=P/'dist';D.mkdir(exist_ok=True)
NATIVE='4.1.0';APP='1.5.1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
nativeFiles={}
for folder in ['src','native']:
 for f in (P/folder).iterdir():
  if f.is_file()and(f.suffix in ['.js','.c','.h']or f.name in ['dvr-io','mfx-codec']):nativeFiles[f.relative_to(P).as_posix()]=f.read_bytes()
for f in (P/'native/intel').glob('*.h'):nativeFiles[f.relative_to(P).as_posix()]=f.read_bytes()
observer=P/'native/observer';nativeFiles['native/observer']=observer.read_bytes();nativeFiles['native/observer.c']=(P/'native/observer.c').read_bytes()
runtime=P/'runtime';source=json.loads((runtime/'FFMPEG-SOURCE.json').read_text());assert sha(runtime/'ffmpeg')==source['ffmpegSha256']
nativeFiles['runtime/ffmpeg']=(runtime/'ffmpeg').read_bytes();nativeFiles['runtime/FFMPEG-SOURCE.json']=(runtime/'FFMPEG-SOURCE.json').read_bytes();nativeFiles['runtime/FFMPEG-CONFIGURATION.txt']=(runtime/'FFMPEG-CONFIGURATION.txt').read_bytes();nativeFiles['runtime/LICENSE.imageio-ffmpeg']=(runtime/'LICENSE.imageio-ffmpeg').read_bytes()
nativeFiles['COPYING.GPLv3']=(P/'LICENSE').read_bytes()
for name in ['NotoSans-Regular.ttf','OFL.txt']:nativeFiles['runtime/'+name]=(P/'runtime'/name).read_bytes()
unit='''[Unit]
Description=Owner continuous DVR
After=ufipc_daemon.service avbstreamhandler.service vsomeipd.service persistency-fs.target
RequiresMountsFor=/var/opt /mnt/share
[Service]
Type=simple
ExecStart=/usr/bin/node /var/opt/owner-dvr/current/src/host.js
Restart=always
RestartSec=3
TimeoutStopSec=12
[Install]
WantedBy=multi-user.target
'''.encode()
component={'id':'owner-dvr','kind':'tool','version':NATIVE,'title':'Recorder Core','description':'Continuous selectable 2/4/8/16 GiB HDD ring, timeline playback and timestamped one-minute USB export','optional':True,'uninstallable':True,'mguHmi':['ID7'],'requires':{'mgu-render':'0.6.19','mgu-deploy':'0.8.11'},'files':[{'path':name,'mode':'0755'if name in ['native/dvr-io','native/observer','native/mfx-codec','runtime/ffmpeg']else'0644','sha256':hashlib.sha256(data).hexdigest()}for name,data in nativeFiles.items()],'units':[{'name':'owner-dvr.service','from':'owner-dvr.service'}],'enable':[{'unit':'owner-dvr.service','target':'multi-user.target'}],'restart':['owner-dvr.service'],'keepRunning':True,'activate':['node','src/live-apply.js'],'deactivate':['node','src/unified-deactivate.js'],'recmgr':['owner-dvr'],'crashNames':['dvr-io','observer','ffmpeg','mfx-codec']}
npath=D/f'owner-dvr@{NATIVE}.tgz'
with tarfile.open(npath,'w:gz')as t:
 def add(name,data,mode=0o644):
  m=tarfile.TarInfo(name);m.size=len(data);m.mode=mode;t.addfile(m,io.BytesIO(data))
 add('component.json',json.dumps(component,indent=2).encode());add('units/owner-dvr.service',unit)
 for name,data in nativeFiles.items():add('files/'+name,data,0o755 if name in ['native/dvr-io','native/observer','native/mfx-codec','runtime/ffmpeg'] else 0o644)

from build_app import build_app
apath=D/f'owner_dvr@{APP}.tgz' if '--native-only' in sys.argv else build_app(P,D,APP,NATIVE)
report={'app':APP,'appId':'owner_dvr','native':NATIVE,'installed':False,'vehicleValidated':False,'artifacts':{p.name:{'bytes':p.stat().st_size,'sha256':sha(p)}for p in [npath,apath]},'target':'MGU ID7 x86_64','dependencies':'Only Store, mgu-render and the target SDK; no old Drive Recorder dependency'}
(D/'BUILD.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
