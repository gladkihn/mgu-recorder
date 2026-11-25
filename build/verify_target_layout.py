"""Exercise kernel exec with MGU's loader path and no /lib64 alias."""
from pathlib import Path
import hashlib,json,re,shutil,subprocess,tempfile
from retarget_elf import TARGET,NAMES,interpreter,retarget
R=Path(__file__).resolve().parent.parent;checks=[]
def run(args,**kw):return subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw)
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);(root/'lib').mkdir();(root/'native').mkdir();(root/'runtime').mkdir();(root/'data').mkdir()
    for name in NAMES:
        binary=R/'recorder'/name;assert interpreter(binary.read_bytes())[2]==TARGET
        shutil.copy2(binary,root/name)
        deps=subprocess.check_output(['ldd',str(binary)],text=True)
        for source in re.findall(r'(/[^\s()]+)',deps):
            p=Path(source)
            if not p.is_file():continue
            dest=root/('lib/'+p.name);shutil.copy2(p.resolve(),dest)
            if not str(p).startswith('/lib64/'):
                dest=root/str(p).lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p.resolve(),dest)
    assert (root/TARGET.lstrip('/')).is_file() and not (root/'lib64').exists()
    # Reproduce the old package's misleading "file not found" for an existing ELF.
    bad=retarget((root/'native/dvr-io').read_bytes(),'/lib64/ld-linux-x86-64.so.2');(root/'native/bad-loader').write_bytes(bad);(root/'native/bad-loader').chmod(0o755)
    r=run(['sudo','chroot',str(root),'/native/bad-loader','allocate','/data/bad.bin','4096']);assert r.returncode!=0 and not (root/'data/bad.bin').exists()
    checks.append('Original /lib64 interpreter fails when ELF exists but loader is absent')
    r=run(['sudo','chroot',str(root),'/native/dvr-io','low-priority','--','/native/dvr-io','allocate','/data/test.bin','4096']);assert r.returncode==0,r.stderr;assert (root/'data/test.bin').stat().st_size==4096
    r=run(['sudo','chroot',str(root),'/native/dvr-io','lockrun','/data/test.lock','/runtime/ffmpeg','-version']);assert r.returncode==0,r.stderr;assert b'ffmpeg version 7.1.5' in r.stdout
    checks.append('Patched helper, nested helper allocation, lockrun and FFmpeg start with /lib only')
    for name,args,code in [('observer',['--seconds','1'],3),('mfx-codec',['--6000kbps'],3)]:
        r=run(['sudo','chroot',str(root),'/native/'+name]+args,input=b'');assert r.returncode==code,(name,r.returncode,r.stderr)
    checks.append('Observer and hardware codec enter their own code; no exec/loader failure')
report={'status':'PASS','checks':checks,'hardwareCameraTested':False,'binaries':{n:hashlib.sha256((R/'recorder'/n).read_bytes()).hexdigest() for n in NAMES}}
(R/'dist').mkdir(exist_ok=True);(R/'dist/target-layout-test.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
