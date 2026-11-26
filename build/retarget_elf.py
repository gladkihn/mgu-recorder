"""Normalize PT_INTERP for MGU without changing code, dependencies or ELF layout."""
from pathlib import Path
import hashlib,json,struct

TARGET='/lib/ld-linux-x86-64.so.2'
NAMES=['native/dvr-io','native/observer','native/mfx-codec','native/mfx-compose','native/mfx-preview','native/nv-feed','runtime/ffmpeg']

def interpreter(data):
    assert data[:6]==b'\x7fELF\x02\x01' and struct.unpack_from('<H',data,18)[0]==62,'Expected little-endian ELF64 x86_64'
    offset=struct.unpack_from('<Q',data,32)[0];size,count=struct.unpack_from('<HH',data,54)
    assert size>=56 and 0<count<=128 and offset+size*count<=len(data)
    found=[]
    for i in range(count):
        at=offset+i*size
        if struct.unpack_from('<I',data,at)[0]==3:
            pos=struct.unpack_from('<Q',data,at+8)[0];length=struct.unpack_from('<Q',data,at+32)[0]
            assert 1<length<=4096 and pos+length<=len(data)
            found.append((pos,length,data[pos:pos+length].split(b'\0')[0].decode('ascii')))
    assert len(found)==1,'Expected one PT_INTERP'
    return found[0]

def retarget(data,target=TARGET):
    pos,length,old=interpreter(data)
    assert old in [TARGET,'/lib64/ld-linux-x86-64.so.2'],'Unexpected interpreter '+old
    replacement=target.encode('ascii')+b'\0';assert len(replacement)<=length
    return data[:pos]+replacement.ljust(length,b'\0')+data[pos+length:]

def main():
    root=Path(__file__).resolve().parent.parent/'recorder';out={}
    for name in NAMES:
        p=root/name;data=retarget(p.read_bytes());p.write_bytes(data)
        out[name]={'sha256':hashlib.sha256(data).hexdigest(),'interpreter':interpreter(data)[2]}
    metadata=root/'runtime/FFMPEG-SOURCE.json'
    if metadata.exists():
        v=json.loads(metadata.read_text());v.update(ffmpegSha256=out['runtime/ffmpeg']['sha256'],elfInterpreter=TARGET,postLinkStep='python build/retarget_elf.py',sourceArchive='https://github.com/gladkihn/mgu-recorder/releases/download/catalog/ffmpeg-sources-7.1.5-mgu1.tar.xz');metadata.write_text(json.dumps(v,indent=2)+'\n')
    print(json.dumps(out,indent=2))

if __name__=='__main__':main()
