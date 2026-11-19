'use strict';
// Store hook: the legacy supervisor remains resident, only its worker is paused.
const fs=require('fs'),path=require('path');
function atomic(file,text){const temp=file+'.owner-new';const fd=fs.openSync(temp,'w',0o600);try{fs.writeSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);if(process.platform!=='win32'){const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}}
function handoff(action,root){root=root||'/var/opt';const owner=path.join(root,'owner-dvr'),saved=path.join(owner,'legacy-rollback.json');if(!fs.existsSync(owner))fs.mkdirSync(owner,0o700);
 if(action==='activate'){const current=path.join(root,'iteriodev-drplay/current/deployment.json');if(!fs.existsSync(current))return {status:'No legacy recorder worker'};const file=fs.realpathSync(current),allowed=fs.realpathSync(path.join(root,'iteriodev-drplay/versions'))+path.sep;if(!file.startsWith(allowed))throw Error('Unexpected legacy deployment path');const text=fs.readFileSync(file,'utf8'),v=JSON.parse(text);if(v.entry!=='dvr-proxy.js'||typeof v.enabled!=='boolean'||!Number.isSafeInteger(v.generation))throw Error('Unsupported legacy worker configuration');if(!fs.existsSync(saved))atomic(saved,JSON.stringify({file,text}));if(v.enabled){v.enabled=false;v.generation++;atomic(file,JSON.stringify(v));}return {status:'Legacy code and recordings retained; its recorder worker paused'};}
 if(action==='deactivate'){if(!fs.existsSync(saved))return {status:'No legacy rollback needed'};const b=JSON.parse(fs.readFileSync(saved,'utf8')),allowed=path.resolve(root,'iteriodev-drplay/versions')+path.sep;if(!path.resolve(b.file).startsWith(allowed))throw Error('Unsafe legacy rollback target');if(!fs.existsSync(b.file))return {status:'Legacy software removed; offline rollback archive retained'};atomic(b.file,b.text);return {status:'Legacy worker configuration restored'};}
 throw Error('Unknown legacy handoff action');
}
if(require.main===module){try{console.log(JSON.stringify(handoff(process.argv[2])));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={handoff};
