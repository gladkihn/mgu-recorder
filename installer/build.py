from pathlib import Path
import json,tarfile,hashlib,shutil,subprocess,sys,re,zipfile
P=Path(__file__).resolve().parent;W=P.parent;PAY=P/'payload';PAY.mkdir(exist_ok=True);OUT=P/'dist';OUT.mkdir(exist_ok=True);E=P/'evidence';E.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
PORTABLE=W/'recorder'
if not PORTABLE.exists():PORTABLE=P/'recorder-source'
def artifact(name,fallback):
 local=P/'vendor'/name
 return local if local.exists() else fallback
artifacts=[]
for src,kind in [(artifact('mgu-deploy@0.8.16.tgz',P/'vendor/mgu-deploy@0.8.16.tgz'),'tool'),(P/'vendor/mgu-render@0.6.19.tgz','tool'),(artifact('owner-dvr@4.1.0.tgz',PORTABLE/'dist/owner-dvr@4.1.0.tgz'),'tool'),(artifact('owner_dvr@1.5.1.tgz',PORTABLE/'dist/owner_dvr@1.5.1.tgz'),'app')]:
 data=src.read_bytes();dst=PAY/src.name;dst.write_bytes(data)
 with tarfile.open(src)as t:
  names=t.getnames();assert not any('node_modules/oap-sdk'in n or n.endswith('private-key')for n in names)
  assert all(not n.startswith('/')and'..'not in n.split('/')for n in names)
  if kind=='tool':m=json.load(t.extractfile('component.json'));ident=m['id'];ver=m['version'];requires=m.get('requires',{});
  else:m=json.load(t.extractfile('owner_dvr@1.5.1/package.json'));ident=m['name'];ver=m['version'];requires=m['mguRequires']
  if ident=='mgu-deploy':
   folder=PAY/'bootstrap';folder.mkdir(exist_ok=True)
   for f in m['files']:
    assert '/'not in f['path'];b=t.extractfile('files/'+f['path']).read();assert sha(b)==f['sha256'];(folder/f['path']).write_bytes(b)
   (folder/'component.json').write_text(json.dumps(m),encoding='utf8')
  if kind=='tool':
   for f in m['files']:assert sha(t.extractfile('files/'+f['path']).read())==f['sha256']
 artifacts.append({'id':ident,'kind':kind,'version':ver,'name':src.name,'bytes':len(data),'sha256':sha(data),'requires':requires})
# Published minimums are all carried offline. Installed higher versions are retained.
versions={a['id']:a['version']for a in artifacts}
for a in artifacts:
 for dep,minimum in a['requires'].items():assert dep in versions and tuple(map(int,versions[dep].split('.')))>=tuple(map(int,minimum.split('.'))),(a['id'],dep)
for f in (P/'remote').glob('*.js'):
 if f.name not in ('preflight.js','preflight-standalone.js'):shutil.copy2(f,PAY/f.name)
(PAY/'payload.json').write_text(json.dumps({'schema':1,'artifacts':artifacts},indent=2),encoding='utf8')
catalog=(PORTABLE/'src/catalog.js').read_text();caps=(PORTABLE/'src/capabilities.js').read_text();preflight=(P/'remote/preflight.js').read_text()
inline="'use strict';\nfunction recorderCapabilities(){const c={exports:{}};(function(module,exports,require){\n"+catalog+"\n})(c,c.exports,require);const a={exports:{}};(function(module,exports,require){\n"+caps+"\n})(a,a.exports,n=>n==='./catalog'?c.exports:require(n));return a.exports.inspect();}\nconst recorderInstallerInline=true;\n"+preflight
(P/'remote/preflight-standalone.js').write_text(inline,encoding='utf8',newline='\n')
(PAY/'preflight-standalone.js').write_text(inline,encoding='utf8',newline='\n')
files=[];resources=[]
for f in sorted(PAY.rglob('*')):
 if not f.is_file():continue
 rel=f.relative_to(PAY).as_posix();resource='payload.'+rel.replace('/','.');b=f.read_bytes();files.append({'path':rel,'resource':resource,'bytes':len(b),'sha256':sha(b)});resources.append((f,resource))
index={'schema':1,'artifacts':artifacts,'files':files,'noVinBinding':True,'includesOwnerKeys':False,'includesBmwSdk':False,'offline':True}
(P/'payload-index.json').write_text(json.dumps(index,indent=2));resources.extend([(P/'payload-index.json','bundle.index'),(P/'remote/preflight-standalone.js','remote.preflight')])
libs=[];licenses=[];LIB=P/'lib';LIB.mkdir(exist_ok=True)
for package in sorted((P/'vendor/packages').iterdir()):
 if not package.is_dir():continue
 candidates=[package/'lib/net462',package/'lib/net461'];folder=next((d for d in candidates if d.exists()),None)
 if not folder:raise ValueError('No Framework assembly '+package.name)
 for f in folder.glob('*.dll'):
  target=LIB/f.name;shutil.copy2(f,target);resources.append((target,'library.'+f.name));libs.append(target)
 for f in package.glob('*'):
  if f.is_file()and('license'in f.name.lower()or'notice'in f.name.lower()):licenses.append({'package':package.name,'file':f.name,'text':f.read_text(encoding='utf8',errors='replace')})
third=P/'THIRD-PARTY-LICENSES.txt';third.write_text((P/'LICENSE-SSH.NET.txt').read_text()+'\n\n'+'\n\n'.join(x['package']+' / '+x['file']+'\n'+x['text']for x in licenses),encoding='utf8')
resources.append((third,'thirdparty.licenses'))
args=[r'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe','/nologo','/target:winexe','/platform:anycpu','/optimize+','/debug-','/utf8output','/out:'+str(OUT/'MGU-Recorder-Installer.exe'),'/win32manifest:'+str(P/'app.manifest')]
for r in ['System.dll','System.Core.dll','System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll','System.IO.Compression.dll','System.IO.Compression.FileSystem.dll']:args.append('/reference:'+r)
args.append('/reference:'+str(next(f for f in libs if f.name=='Renci.SshNet.dll').relative_to(P)))
for f,name in resources:args.append('/resource:'+str(f.relative_to(P))+','+name)
args.extend(str(f.relative_to(P))for f in sorted((P/'src').glob('*.cs')))
subprocess.run(args,check=True,cwd=P)
exe=OUT/'MGU-Recorder-Installer.exe';report={'status':'BUILT_NOT_CAR_TESTED','exe':str(exe),'bytes':exe.stat().st_size,'sha256':sha(exe.read_bytes()),'architecture':'AnyCPU','windows':'Windows 10/11 with .NET Framework 4.6.2+','desktopNodeRequired':False,'desktopOpenSshRequired':False,'artifacts':artifacts,'libraries':[f.name for f in libs],'carTouched':False,'requiresExistingSshAuthorization':True,'codeSigned':False}
(E/'BUILD.json').write_text(json.dumps(report,indent=2));exe.with_suffix('.exe.sha256').write_text(report['sha256']+'  '+exe.name+'\n');print(json.dumps(report,indent=2))
