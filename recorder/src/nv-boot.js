'use strict';
// Called before stock nivi3sink. Never stops/restarts an OEM service.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{prepare}=require('./nv-tap-prepare');
const ROOT='/var/opt/owner-dvr',SHM='/dev/shm/owner-dvr-nv-frame';
function trusted(file){try{const s=fs.lstatSync(file);return s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&!(s.mode&0o022)&&s.size<8192;}catch(e){return false;}}
function json(file){if(!trusted(file))return null;try{return JSON.parse(fs.readFileSync(file));}catch(e){return null;}}
function clearBuffer(){try{const s=fs.lstatSync(SHM);if(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&s.nlink===1)fs.unlinkSync(SHM);}catch(e){}}
function save(file,value){fs.writeFileSync(file+'.new',JSON.stringify(value)+'\n',{mode:0o600});fs.renameSync(file+'.new',file);}
function recordSignature(file){try{const s=fs.statSync(file);return [s.ino,s.size,s.mtime.getTime()].join(':');}catch(e){return null;}}
const records=['/var/opt/public/sin/recmgr/restartInfo.xml','/var/opt/public/sin/crashhandler/restartInfo.xml'];
function run(){const profileFile=path.resolve(__dirname,'../nv-capture.json');if(!fs.existsSync(profileFile)){clearBuffer();return {armed:false,reason:'NO_PROFILE'};}const bytes=fs.readFileSync(profileFile),hash=crypto.createHash('sha256').update(bytes).digest('hex'),onceFile=ROOT+'/nv-arm-once.json',once=json(onceFile),enabled=json(ROOT+'/nv-enabled.json'),previous=json(ROOT+'/nv-boot-state.json');let mode=null;
 if(once&&once.profileSha256===hash){fs.unlinkSync(onceFile);mode='one-shot';}else if(enabled&&enabled.enabled===true&&enabled.profileSha256===hash)mode='enabled';if(!mode)mode='verified-profile-passive';
 if(mode!=='one-shot'&&previous&&previous.records){for(const file of records)if(recordSignature(file)!==previous.records[file]){let text='';try{text=fs.readFileSync(file,'utf8');}catch(e){}if(/nivi3sink(?:\.service)?/.test(text)){clearBuffer();return {armed:false,reason:'PREVIOUS_NV_FAILURE'};}}}
 clearBuffer();const result=prepare(JSON.parse(bytes)),boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),seen={};for(const file of records)seen[file]=recordSignature(file);save(ROOT+'/nv-boot-state.json',{boot,mode,profileSha256:hash,at:Date.now(),records:seen});return Object.assign({armed:true,mode,boot},result);
}
if(require.main===module){try{console.log(JSON.stringify(run()));}catch(e){clearBuffer();console.error('NV disabled: '+e.message);process.exitCode=0;}}
module.exports={run,trusted};
