'use strict';
// Only a short, non-sensitive code is shared with the unprivileged UI.
const fs=require('fs'),FILE='/run/owner-dvr-diagnostic.json';
function classify(error,phase){const s=String(error&&error.message||error||'');
 if(error&&error.code==='ENOSPC'||/ENOSPC|No space|Not enough free/i.test(s))return 'D_SPACE';
 if(/HDD|HDD mount/i.test(s))return 'D_HDD';
 if(error&&['EACCES','EPERM'].indexOf(error.code)>=0||/permission denied|EACCES|EPERM/i.test(s))return 'D_ACCESS';
 if(/Cannot find module|MODULE_NOT_FOUND|ENOENT|not found|Exec format|shared librar/i.test(s))return 'D_COMPONENT';
 if(/archive|allocation|allocate|ring geometry/i.test(s)||phase==='archive')return 'D_ARCHIVE';
 if(/catalogue|catalog|requires x86|Target lacks|unsupported/i.test(s))return 'D_TARGET';
 return phase==='platform'?'D_PLATFORM':phase==='capture'?'D_CAMERA':'D_WORKER';
}
function write(stage,code,file){try{file=file||FILE;const tmp=file+'.'+process.pid+'.new',v={schema:1,boot:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),pid:process.pid,stage,code,at:Date.now()};fs.writeFileSync(tmp,JSON.stringify(v),{mode:0o644});fs.chmodSync(tmp,0o644);fs.renameSync(tmp,file);}catch(e){process.stderr.write('Recorder diagnostic unavailable: '+e.message+'\n');}}
function failure(e,phase){write('failed',classify(e,phase));}
module.exports={classify,write,failure,FILE};
