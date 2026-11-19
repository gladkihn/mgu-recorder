'use strict';
// Only our two fixed component IDs go through Store removal. No HDD deletion.
const fs=require('fs'),cp=require('child_process'),path=require('path'),stage=__dirname,id=path.basename(stage);
let record=null;
function run(args){const p=cp.spawnSync('/var/opt/mgu-deploy/mgu-deploy.sh',args,{encoding:'utf8',maxBuffer:16777216,timeout:900000});process.stdout.write(p.stdout||'');process.stderr.write(p.stderr||'');if(p.error||p.status!==0)throw Error('Store removal failed: '+(p.error&&p.error.message||p.stderr||p.status));return p.stdout;}
function fresh(){const p=cp.spawnSync('/usr/bin/node',[stage+'/preflight-standalone.js'],{encoding:'utf8',maxBuffer:16777216,timeout:30000});if(p.error||p.status!==0)throw Error('Removal preflight failed');return JSON.parse(p.stdout);}
function verify(v,boot){if(!v.removalSupported||!v.storeInstalled||v.hmi!=='ID7'||v.boot!==boot)throw Error('MGU changed or removal is not supported');}
function save(){const file='/var/opt/mgu-recorder-installer/transactions/'+id+'.json';fs.writeFileSync(file+'.new',JSON.stringify(record,null,2),{mode:0o600});fs.renameSync(file+'.new',file);}
try{
 if(!/^run-[a-f0-9]{32}$/.test(id)||require('os').hostname()!=='mgu'||process.getuid()!==0||!fs.existsSync('/var/opt/mgu-deploy/mgu-deploy.sh'))throw Error('MGU/root/deploy required');
 const before=JSON.parse(fs.readFileSync(stage+'/before.json')),boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();verify(before,boot);let current=fresh();verify(current,boot);
 const ids=['owner_dvr','owner-dvr'];for(const key of ids)if((before.versions[key]||null)!==(current.versions[key]||null))throw Error('Recorder changed since confirmation; run check again');
 record={schema:1,operation:'uninstall',transaction:id,status:'UNINSTALLING',before,steps:[],archivePreserved:true,settingsPreserved:true,dependenciesRetained:true,automaticReboot:false};save();
 for(const key of ids){
  current=fresh();verify(current,boot);if((current.versions[key]||null)!==(before.versions[key]||null))throw Error('Recorder changed concurrently');
  if(!current.versions[key])continue;
  // Never remove the shared server while application removal is incomplete.
  if(key==='owner-dvr'&&current.versions.owner_dvr)throw Error('Recorder application is still installed');
  record.steps.push({id:key,status:'started'});save();run(['uninstall',key,'--yes']);
  current=fresh();verify(current,boot);if(current.versions[key])throw Error(key+' removal did not complete');record.steps[record.steps.length-1].status='removed';save();
 }
 record.after=current;record.status=record.steps.length?'UNINSTALLED':'ALREADY_UNINSTALLED';
 record.storeStatus=JSON.parse(run(['status','--read-only','--json']));save();console.log('RECORDER_RESULT '+JSON.stringify(record));
}catch(e){if(record){record.status='UNINSTALL_FAILED';record.error=e.message;try{save();}catch(x){console.error(x.message);}}console.error(e.message);process.exitCode=1;}
