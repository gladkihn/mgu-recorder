from pathlib import Path
import hashlib,io,json,tarfile,sys,shutil,subprocess,gzip
R=Path(__file__).resolve().parent.parent;P=R/'recorder';D=R/'dist';D.mkdir(exist_ok=True)
CORE='4.7.0';APP='1.7.0';APP_MIN_CORE='4.6.0';BASE='https://github.com/gladkihn/mgu-recorder/releases/download/catalog/'
from retarget_elf import interpreter,TARGET,NAMES
for name in NAMES:assert interpreter((P/name).read_bytes())[2]==TARGET,('Incorrect MGU ELF interpreter',name)
def sha(data):return hashlib.sha256(data).hexdigest()
def add(t,name,data,mode=0o644):
    member=tarfile.TarInfo(name);member.size=len(data);member.mode=mode;member.mtime=0;t.addfile(member,io.BytesIO(data))
files={f.relative_to(P).as_posix():f.read_bytes() for f in (P/'src').glob('*.js')}
for name in ['dvr-io','observer','mfx-codec','mfx-compose','mfx-preview','nv-feed']:files['native/'+name]=(P/'native'/name).read_bytes()
for f in (P/'runtime').rglob('*'):
    if f.is_file():files[f.relative_to(P).as_posix()]=f.read_bytes()
files['native/nv-tap.so']=(P/'native/nv-tap.so').read_bytes()
files['nv-capture.json']=(P/'nv-capture.json').read_bytes()
files['LICENSE']=(R/'LICENSE').read_bytes()
files['licenses/Intel-libva.txt']=(P/'native/intel/va-image-abi.h').read_text().split('#ifndef')[0].encode()
notices=set()
for header in (P/'native/intel').glob('*.h'):
    lines=[]
    for line in header.read_text().splitlines():
        if line.startswith('//') or not line.strip():lines.append(line)
        else:break
    if lines:notices.add('\n'.join(lines).strip())
files['licenses/Intel-Media-SDK.txt']=('\n\n'.join(sorted(notices))+'\n').encode()
source=json.loads(files['runtime/FFMPEG-SOURCE.json']);assert sha(files['runtime/ffmpeg'])==source['ffmpegSha256']
component={'id':'owner-dvr','kind':'tool','version':CORE,'title':'Recorder Server','optional':True,'uninstallable':True,'mguHmi':['ID7'],'requires':{'mgu-deploy':'0.8.11'},'files':[{'path':name,'mode':'0755' if name in ['native/dvr-io','native/observer','native/mfx-codec','native/mfx-compose','native/mfx-preview','native/nv-feed','runtime/ffmpeg'] else '0644','sha256':sha(data)} for name,data in sorted(files.items())],'units':[{'name':'owner-dvr.service'},{'name':'owner-dvr-nv-tap.service'}],'enable':[{'unit':'owner-dvr.service','target':'multi-user.target'},{'unit':'owner-dvr-nv-tap.service','target':'multi-user.target'}],'dropins':[{'unit':'nivi3sink.service','name':'90-owner-dvr-nv.conf'}],'restart':['owner-dvr.service'],'keepRunning':True,'activate':['node','src/live-apply.js'],'deactivate':['node','src/unified-deactivate.js'],'recmgr':['owner-dvr','owner-dvr-nv-tap'],'crashNames':['dvr-io','observer','ffmpeg','mfx-codec','mfx-compose','mfx-preview','nv-feed']}
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
nv_unit=b'''[Unit]
Description=Recorder passive NV capture preparation
After=persistency-fs.target
Before=nivi3sink.service
RequiresMountsFor=/var/opt
[Service]
Type=oneshot
ExecStart=/usr/bin/node /var/opt/owner-dvr/current/src/nv-boot.js
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
'''
nv_dropin=b'''[Unit]
Wants=owner-dvr-nv-tap.service
After=owner-dvr-nv-tap.service
[Service]
Environment=OWNER_DVR_NV_TAP=1
Environment=OWNER_DVR_NV_SAR_NUM=9
Environment=OWNER_DVR_NV_SAR_DEN=10
Environment=LD_PRELOAD=/var/opt/owner-dvr/current/native/nv-tap.so
'''
core=D/f'owner-dvr@{CORE}.tgz'
if core.exists():
    # Published versions are immutable; a UI-only release retains the exact server asset.
    with tarfile.open(core) as t:
        expected={'component.json':json.dumps(component,indent=2).encode(),'units/owner-dvr.service':unit,'units/owner-dvr-nv-tap.service':nv_unit,'dropins/nivi3sink.service.d/90-owner-dvr-nv.conf':nv_dropin}
        expected.update({'files/'+name:data for name,data in files.items()})
        assert set(t.getnames())==set(expected),'Bump CORE when changing server package contents'
        for name,data in expected.items():assert t.extractfile(name).read()==data,('Bump CORE when changing server contents',name)
else:
    with core.open('wb') as raw,gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as z,tarfile.open(fileobj=z,mode='w')as t:
        add(t,'component.json',json.dumps(component,indent=2).encode());add(t,'units/owner-dvr.service',unit);add(t,'units/owner-dvr-nv-tap.service',nv_unit);add(t,'dropins/nivi3sink.service.d/90-owner-dvr-nv.conf',nv_dropin)
        for name,data in sorted(files.items()):add(t,'files/'+name,data,0o755 if name in ['native/dvr-io','native/observer','native/mfx-codec','native/mfx-compose','native/mfx-preview','native/nv-feed','runtime/ffmpeg'] else 0o644)
sys.path.insert(0,str(P));from build_app import build_app
app=build_app(P,D,APP,APP_MIN_CORE)
icon=D/'Recorder.png';shutil.copyfile(P/'ui/icon.png',icon)
entries=[]
for target,kind,title,requires in [(core,'tool','Recorder Server',component['requires']),(app,'app','Recorder',{'owner-dvr':APP_MIN_CORE,'mgu-render':'0.6.19','mgu-deploy':'0.8.11'})]:
    data=target.read_bytes();entry={'id':'owner-dvr' if kind=='tool' else 'owner_dvr','kind':kind,'title':title,'version':CORE if kind=='tool' else APP,'artifact':{'name':target.name,'size':len(data),'sha256':sha(data),'url':BASE+target.name},'requires':requires,'optional':kind=='tool','uninstallable':True,'mguHmi':['ID7']}
    if kind=='app':entry.update(build='unit',icon='Recorder.png',iconSha256=sha(icon.read_bytes()))
    entries.append(entry)
catalog=json.dumps({'schema':2,'components':entries},indent=2)+'\n';(D/'catalog.json').write_text(catalog);(R/'catalog.json').write_text(catalog)
sources=D/'ffmpeg-sources-7.1.5-mgu1.tar.xz'
if not sources.exists():
    with tarfile.open(sources,'w:xz')as t:
        for f in sorted((R/'.build/sources').iterdir()):add(t,'sources/'+f.name,f.read_bytes())
        for name in ['ffmpeg.sh','fetch.py','ffmpeg-sources.json','verify_runtime.py','retarget_elf.py','verify_target_layout.py']:add(t,'build/'+name,(R/'build'/name).read_bytes(),0o755 if name.endswith('.sh')else 0o644)
        for name in ['FFMPEG-CONFIGURATION.txt','FFMPEG-SOURCE.json']:add(t,name,(P/'runtime'/name).read_bytes())
        for f in sorted((P/'runtime/licenses').iterdir()):add(t,'licenses/'+f.name,f.read_bytes())
        if (D/'build-image.txt').exists():add(t,'build-image.txt',(D/'build-image.txt').read_bytes())
        add(t,'REBUILD',b'Extract this archive to .build/ in the source tree; build/ffmpeg.sh uses the SHA256-checked sources in .build/sources. Build with the manylinux2014 container recorded in build-image.txt. No upstream source modifications were applied. ELF interpreters are normalized by build/retarget_elf.py.\n')
(D/'SHA256SUMS').write_text(''.join(sha(f.read_bytes())+'  '+f.name+'\n' for f in sorted(D.iterdir())if f.is_file()and f.name!='SHA256SUMS'))
print(catalog)
