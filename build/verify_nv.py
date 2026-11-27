"""Exercise the real Linux NV reader and shared ring in an isolated root filesystem."""
from pathlib import Path
import json,mmap,os,select,shutil,struct,subprocess,tempfile,time,re
R=Path(__file__).resolve().parent.parent
assert os.geteuid()==0,'Run with sudo; fixture files must match the MGU root owner'
def readn(p,n):
    out=b'';deadline=time.monotonic()+5
    while len(out)<n:
        wait=deadline-time.monotonic()
        if wait<=0 or not select.select([p.stdout],[],[],wait)[0]:raise RuntimeError('NV protocol timeout')
        b=os.read(p.stdout.fileno(),n-len(out))
        if not b:raise RuntimeError('NV reader ended: '+p.stderr.read().decode())
        out+=b
    return out
checks=[]
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);(root/'native').mkdir();(root/'dev/shm').mkdir(parents=True)
    binary=R/'recorder/native/nv-feed';shutil.copy2(binary,root/'native/nv-feed')
    for source in re.findall(r'(/[^\s()]+)',subprocess.check_output(['ldd',str(binary)],text=True)):
        p=Path(source)
        if p.is_file():
            dest=root/str(p).lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p.resolve(),dest)
    maximum=2*1048576;size=64+16*(64+maximum);raw=root/'dev/shm/owner-dvr-nv-frame'
    fd=os.open(raw,os.O_RDWR|os.O_CREAT,0o660);os.ftruncate(fd,size);buf=mmap.mmap(fd,size);os.close(fd)
    struct.pack_into('<6I',buf,0,0x3154564e,1,0,0,16,1)
    seq=0
    def field(which,value):
        nonlocal_unused=None
        global seq
        seq+=1;slot=seq%16;at=64+slot*(64+maximum);stamp=time.monotonic_ns()
        meta=[512,seq,stamp&0xffffffff,stamp>>32,16,16,32,0x59565955,1,1,2 if which==0 else 3,seq,0,0,0,seq*2-1]
        struct.pack_into('<16I',buf,at,*meta);buf[at+64:at+576]=bytes([value])*512;struct.pack_into('<I',buf,at+60,seq*2);struct.pack_into('<II',buf,8,seq,slot)
    def start():
        p=subprocess.Popen(['chroot',str(root),'/native/nv-feed','--shm'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        time.sleep(.1);p.stdin.write(b'C');return p
    def packet(p,top,bottom):
        field(0,top);field(1,bottom);data=readn(p,64);h=struct.unpack('<10I',data[:40]);ref=struct.unpack('<6I',data[40:]);assert h[0:2]==(24,0x3152564e) and h[4:7]==(16,32,32)
        woven=root/'dev/shm/owner-dvr-nv-woven';f=os.open(woven,os.O_RDONLY);head=os.pread(f,64,0);assert struct.unpack_from('<I',head)[0]==0x3157564e
        slot=64+ref[2]*(64+maximum);meta=os.pread(f,64,slot);pixels=os.pread(f,1024,slot+64);os.close(f)
        assert ref[0]==0x3152564e and ref[3]==1024 and ref[5]==128 and struct.unpack_from('<I',meta,60)[0]==ref[1]*2
        assert all(pixels[y*32:(y+1)*32]==bytes([top if y%2==0 else bottom])*32 for y in range(32))
        return ref
    p=start()
    try:
        first=packet(p,11,22);checks.append('Actual NV reader weaves both fields and sends only a 64-byte descriptor; shared pixels match')
        field(0,33);field(1,44);assert not select.select([p.stdout],[],[],.15)[0]
        p.stdin.write(b'C');data=readn(p,64);second=struct.unpack('<6I',data[40:]);assert second[1]==first[1]+1;checks.append('Producer credit prevents unbounded descriptors when the JS consumer is paused')
        other=subprocess.run(['chroot',str(root),'/native/nv-feed','--shm'],input=b'C',stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3);assert other.returncode==3;checks.append('A second writer is rejected without touching the active capture ring')
    finally:p.terminate();p.wait(timeout=3)
    p=start()
    try:
        third=packet(p,55,66);assert third[1]==second[1]+1 and third[4]==first[4];checks.append('Reader restart preserves the generation and outstanding references; no stale-frame aliasing')
    finally:p.terminate();p.wait(timeout=3);buf.close()
report={'status':'PASS','checks':checks,'vehicleAccessed':False,'linuxNativeExecuted':True}
(R/'dist/nv-native-test.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
