'use strict';
// Share only short codes, known errno/signal values and own source locations.
const fs=require('fs'),FILE='/run/owner-dvr-diagnostic.json';
function classify(error,phase){const s=String(error&&error.message||error||'');
 if(/recorder lock unavailable|EWOULDBLOCK|EAGAIN.*lock/i.test(s))return 'D_LOCK';
 if(/Unsafe recorder directory/.test(s))return 'D_DIRECTORY';
 if(error&&error.code==='EADDRINUSE'||/EADDRINUSE|address already in use/i.test(s))return 'D_SOCKET';
 if(error&&error.code==='EROFS'||/EROFS|read.only file system/i.test(s))return 'D_READONLY';
 if(error&&['EIO','ENODEV','ENXIO'].indexOf(error.code)>=0)return 'D_IO';
 if(error&&error.code==='ENOSPC'||/ENOSPC|No space|Not enough free/i.test(s))return 'D_SPACE';
 if(/HDD|HDD mount/i.test(s))return 'D_HDD';
 if(error&&['EACCES','EPERM'].indexOf(error.code)>=0||/permission denied|EACCES|EPERM/i.test(s))return 'D_ACCESS';
 if(/Cannot find module|MODULE_NOT_FOUND|ENOENT|not found|Exec format|shared librar/i.test(s))return 'D_COMPONENT';
 if(/archive|allocation|allocate|ring geometry/i.test(s)||phase==='archive')return 'D_ARCHIVE';
 if(/catalogue|catalog|requires x86|Target lacks|unsupported/i.test(s))return 'D_TARGET';
 if(error&&['SyntaxError','TypeError','ReferenceError','RangeError'].indexOf(error.name)>=0||/\b(?:TypeError|ReferenceError|SyntaxError|RangeError):/.test(s))return 'D_JS';
 if(error&&error.signal)return 'D_SIGNAL';
 if(error&&Number.isInteger(error.exitCode))return 'D_EXIT';
 return phase==='platform'?'D_PLATFORM':phase==='capture'?'D_CAMERA':'D_WORKER';
}
const PHASES=['startup','directories','settings','archive','archive-index','components','rpc','ready','platform','capture'];
function detail(e,phase){const out=[];if(PHASES.indexOf(phase)>=0)out.push(phase);if(e&&['EACCES','EPERM','ENOENT','ENOSPC','EROFS','EIO','ENODEV','ENXIO','EADDRINUSE','EINVAL','ENOSYS','ENOTSUP','EMFILE','ENFILE','EAGAIN','EWOULDBLOCK','EEXIST','ENOTDIR','EISDIR','ETIMEDOUT','ENOBUFS','ENOMEM','EPIPE','ECONNRESET','ECONNREFUSED'].indexOf(e.code)>=0)out.push(e.code);if(e&&['SIGSEGV','SIGBUS','SIGABRT','SIGKILL','SIGTERM','SIGILL','SIGFPE','SIGINT','SIGHUP','SIGPIPE'].indexOf(e.signal)>=0)out.push(e.signal);else if(e&&Number.isInteger(e.exitCode))out.push('exit '+e.exitCode);const stack=String(e&&e.stack||''),m=/(?:[\\/])((?:service|host|config|identity|ring|io|archive-store|trips|media|video-hub|remote-video-server|compressor|exporter)\.js):(\d{1,6}):\d+/.exec(stack);if(m)out.push(m[1]+':'+m[2]);return out.slice(0,3).join(' ');}
function write(stage,code,file,extra){try{file=file||FILE;const tmp=file+'.'+process.pid+'.new',v={schema:1,boot:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),pid:process.pid,stage,code,at:Date.now()};if(extra)v.detail=extra;fs.writeFileSync(tmp,JSON.stringify(v),{mode:0o644});fs.chmodSync(tmp,0o644);fs.renameSync(tmp,file);}catch(e){process.stderr.write('Recorder diagnostic unavailable: '+e.message+'\n');}}
function failure(e,phase){write('failed',classify(e,phase),null,detail(e,phase));}
module.exports={classify,write,failure,detail,PHASES,FILE};
