from pathlib import Path
import subprocess,re,json,tempfile,os
R=Path(__file__).resolve().parent.parent;F=R/'recorder/runtime/ffmpeg';D=R/'dist';D.mkdir(exist_ok=True)
def run(args,**kwargs):return subprocess.run([str(F)]+args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs)
checks=[]
allowed={'libc.so.6','libm.so.6','libpthread.so.0','libdl.so.2','librt.so.1','libgcc_s.so.1'}
for binary in [F]+[R/'recorder/native'/name for name in ['dvr-io','observer','mfx-codec']]:
    data=binary.read_bytes();assert data[:5]==b'\x7fELF\x02' and int.from_bytes(data[18:20],'little')==62
    versions=subprocess.check_output(['readelf','--version-info',str(binary)],text=True)
    assert all(tuple(map(int,m.split('.')))<=(2,17) for m in re.findall(r'GLIBC_([0-9.]+)',versions)),binary
    needed=subprocess.check_output(['readelf','-d',str(binary)],text=True)
    libraries=set(re.findall(r'Shared library: \[(.*?)\]',needed));assert libraries<=allowed,(binary,libraries)
checks.append('All ELF x86_64 helpers and FFmpeg require glibc <= 2.17 and only system runtime libraries')
with tempfile.TemporaryDirectory()as tmp:
    p=Path(tmp);w,h=1280,480;frame=bytes([48])*(w*h)+bytes([128])*(w*h//2)
    args=['-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','yuv420p','-video_size','1280x480','-framerate','25','-i','pipe:0','-an','-c:v','libx264','-threads','1','-preset','ultrafast','-g','1','-pix_fmt','yuv420p','-frames:v','1','-f','h264',str(p/'frame.h264')]
    run(args,input=frame)
    mux="const fs=require('fs'),M=require(process.argv[1]),m=new M.Mux(),b=fs.readFileSync(process.argv[2]),f=fs.openSync(process.argv[3],'wx');for(let i=0;i<50;i++)fs.writeSync(f,m.frame(b,90000+i*3600));fs.closeSync(f);"
    subprocess.run(['node','-e',mux,str(R/'recorder/src/mpegts.js'),str(p/'frame.h264'),str(p/'input.ts')],check=True)
    (p/'stamp.ass').write_text('''[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 480
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Noto Sans,28,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,20,20,20,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:01:00.00,Default,,0,0,0,,2026-11-19 12:34:56 70
''')
    args=['-hide_banner','-loglevel','error','-threads','1','-copyts','-start_at_zero','-fflags','+genpts','-f','mpegts','-i',str(p/'input.ts'),'-an','-t','60','-vf',f'scale=1280:480:flags=fast_bilinear,fps=25,tpad=stop_mode=clone:stop_duration=60,ass={p}/stamp.ass:fontsdir={R}/recorder/runtime','-r','25','-fps_mode','cfr','-c:v','libx264','-threads','1','-preset','ultrafast','-crf','20','-pix_fmt','yuv420p','-profile:v','main','-level:v','3.1','-maxrate','8M','-bufsize','16M','-metadata','creation_time=2026-11-19T12:34:56.000Z','-movflags','+faststart','-brand','mp42','-progress','pipe:1','-fs',str(256*1048576),'-y','-f','mp4','/proc/self/fd/4']
    fd=os.open(p/'export.mp4',os.O_RDWR|os.O_CREAT|os.O_EXCL,0o644)
    if fd!=4:os.dup2(fd,4);os.close(fd)
    try:subprocess.run([str(R/'recorder/native/dvr-io'),'low-priority','--',str(F)]+args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,pass_fds=(4,))
    finally:os.close(4)
    data=(p/'export.mp4').read_bytes();assert b'ftypmp42' in data and data.index(b'moov')<data.index(b'mdat')
    child=subprocess.Popen([str(F),'-hide_banner','-loglevel','error','-threads','1','-i',str(p/'export.mp4'),'-an','-threads','1','-pix_fmt','yuv420p','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    first=child.stdout.read(len(frame));assert sum(v>180 for v in first[:w*h])>100,'ASS text/font did not render'
    count=len(first)
    while chunk:=child.stdout.read(1024*1024):count+=len(chunk)
    assert child.wait()==0,child.stderr.read().decode();assert count==len(frame)*1500,count
    checks.append('Production low-priority helper + FD4 export: H.264 Main/yuv420p MP4 mp42 + faststart, 60 seconds, 1500 frames; ASS timestamp/speed rendered with Noto')
    raw=run(['-hide_banner','-loglevel','error','-threads','1','-probesize','65536','-analyzeduration','0','-f','mpegts','-i',str(p/'input.ts'),'-an','-vf','scale=1280:480:flags=fast_bilinear','-threads','1','-pix_fmt','yuv420p','-vsync','0','-f','rawvideo','pipe:1']).stdout
    assert len(raw)==len(frame)*50
    checks.append('Recorder native MPEG-TS mux and existing preview command decode all 50 frames')
(D/'runtime-test.json').write_text(json.dumps({'status':'PASS','checks':checks,'vehicleTested':False},indent=2)+'\n')
print('\n'.join(checks))
