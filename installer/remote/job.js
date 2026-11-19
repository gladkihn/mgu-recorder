'use strict';
const fs=require('fs'),cp=require('child_process'),stage=__dirname,file=stage+'/job.json',boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
function put(v){fs.writeFileSync(file+'.new',JSON.stringify(v),{mode:0o600});fs.renameSync(file+'.new',file);}
let operation='install';
try{if(fs.existsSync(stage+'/operation.json'))operation=JSON.parse(fs.readFileSync(stage+'/operation.json')).operation;if(['install','uninstall'].indexOf(operation)<0)throw Error('Unknown operation');}catch(e){put({status:'FAILED',boot,error:e.message});process.exit(1);}
put({status:'RUNNING',operation,pid:process.pid,boot,started:new Date().toISOString()});
try{const r=cp.spawnSync('/usr/bin/node',[stage+'/'+operation+'.js'],{stdio:'inherit',timeout:1800000});const id=require('path').basename(stage),receipt='/var/opt/mgu-recorder-installer/transactions/'+id+'.json';let result=null;try{result=JSON.parse(fs.readFileSync(receipt));}catch(e){}const success=r.status===0&&result&&['INSTALLED','ALREADY_CURRENT','UNINSTALLED','ALREADY_UNINSTALLED'].indexOf(result.status)>=0;put({status:success?'FINISHED':'FAILED',operation,code:r.status,boot,finished:new Date().toISOString(),error:r.error&&r.error.message,result});}
catch(e){put({status:'FAILED',boot,error:e.message});process.exitCode=1;}
