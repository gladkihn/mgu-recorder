from pathlib import Path
import hashlib,io,json,tarfile,sys,shutil,subprocess
R=Path(__file__).resolve().parent.parent;P=R/'recorder';D=R/'dist';D.mkdir(exist_ok=True)
CORE='4.3.1';APP='1.5.5';APP_MIN_CORE='4.3.1';BASE='https://github.com/gladkihn/mgu-recorder/releases/download/catalog/'
def sha(data):return hashlib.sha256(data).hexdigest()
def add(t,name,data,mode=0o644):
    member=tarfile.TarInfo(name);member.size=len(data);member.mode=mode;member.mtime=0;t.addfile(member,io.BytesIO(data))
files={f.relative_to(P).as_posix():f.read_bytes() for f in (P/'src').glob('*.js')}
for name in ['dvr-io','observer','mfx-codec']:files['native/'+name]=(P/'native'/name).read_bytes()
for f in (P/'runtime').rglob('*'):
    if f.is_file():files[f.relative_to(P).as_posix()]=f.read_bytes()
files['LICENSE']=(R/'LICENSE').read_bytes()
notices=set()
for header in (P/'native/intel').glob('*.h'):
    lines=[]
    for line in header.read_text().splitlines():
        if line.startswith('//') or not line.strip():lines.append(line)
        else:break
    if lines:notices.add('\n'.join(lines).strip())
files['licenses/Intel-Media-SDK.txt']=('\n\n'.join(sorted(notices))+'\n').encode()
source=json.loads(files['runtime/FFMPEG-SOURCE.json']);assert sha(files['runtime/ffmpeg'])==source['ffmpegSha256']
component={'id':'owner-dvr','kind':'tool','version':CORE,'title':'Recorder Server','optional':True,'uninstallable':True,'mguHmi':['ID7'],'requires':{'mgu-deploy':'0.8.11'},'files':[{'path':name,'mode':'0755' if name in ['native/dvr-io','native/observer','native/mfx-codec','runtime/ffmpeg'] else '0644','sha256':sha(data)} for name,data in sorted(files.items())],'units':[{'name':'owner-dvr.service'}],'enable':[{'unit':'owner-dvr.service','target':'multi-user.target'}],'restart':['owner-dvr.service'],'keepRunning':True,'activate':['node','src/live-apply.js'],'deactivate':['node','src/unified-deactivate.js'],'recmgr':['owner-dvr'],'crashNames':['dvr-io','observer','ffmpeg','mfx-codec']}
unit=b'''[Unit]
Description=Recorder Server
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
'''
core=D/f'owner-dvr@{CORE}.tgz'
with tarfile.open(core,'w:gz')as t:
    add(t,'component.json',json.dumps(component,indent=2).encode());add(t,'units/owner-dvr.service',unit)
    for name,data in sorted(files.items()):add(t,'files/'+name,data,0o755 if name in ['native/dvr-io','native/observer','native/mfx-codec','runtime/ffmpeg'] else 0o644)
sys.path.insert(0,str(P));from build_app import build_app
app=build_app(P,D,APP,APP_MIN_CORE)
icon=D/'Recorder.png';shutil.copyfile(P/'ui/icon.png',icon)
entries=[]
for target,kind,title,requires in [(core,'tool','Recorder Server',component['requires']),(app,'app','Recorder',{'owner-dvr':APP_MIN_CORE,'mgu-render':'0.6.19','mgu-deploy':'0.8.11'})]:
    data=target.read_bytes();entry={'id':'owner-dvr' if kind=='tool' else 'owner_dvr','kind':kind,'title':title,'version':CORE if kind=='tool' else APP,'artifact':{'name':target.name,'size':len(data),'sha256':sha(data),'url':BASE+target.name},'requires':requires,'optional':kind=='tool','uninstallable':True,'mguHmi':['ID7']}
    if kind=='app':entry.update(build='unit',icon='Recorder.png',iconSha256=sha(icon.read_bytes()))
    entries.append(entry)
catalog=json.dumps({'schema':2,'components':entries},indent=2)+'\n';(D/'catalog.json').write_text(catalog);(R/'catalog.json').write_text(catalog)
sources=D/'ffmpeg-sources-7.1.5.tar.xz'
with tarfile.open(sources,'w:xz')as t:
    for f in sorted((R/'.build/sources').iterdir()):add(t,'sources/'+f.name,f.read_bytes())
    for name in ['ffmpeg.sh','fetch.py','ffmpeg-sources.json','verify_runtime.py']:add(t,'build/'+name,(R/'build'/name).read_bytes(),0o755 if name.endswith('.sh')else 0o644)
    for name in ['FFMPEG-CONFIGURATION.txt','FFMPEG-SOURCE.json']:add(t,name,(P/'runtime'/name).read_bytes())
    for f in sorted((P/'runtime/licenses').iterdir()):add(t,'licenses/'+f.name,f.read_bytes())
    if (D/'build-image.txt').exists():add(t,'build-image.txt',(D/'build-image.txt').read_bytes())
    add(t,'REBUILD',b'Extract this archive to .build/ in the source tree; build/ffmpeg.sh uses the SHA256-checked sources in .build/sources. Build with the manylinux2014 container recorded in build-image.txt. No source modifications were applied.\n')
(D/'SHA256SUMS').write_text(''.join(sha(f.read_bytes())+'  '+f.name+'\n' for f in sorted(D.iterdir())if f.is_file()and f.name!='SHA256SUMS'))
print(catalog)
