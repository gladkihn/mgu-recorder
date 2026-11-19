'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
const stage=__dirname,manifest=JSON.parse(fs.readFileSync(stage+'/payload.json')),runId=path.basename(stage),receipt='/var/opt/mgu-recorder-installer/transactions/'+runId+'.json';
let before=JSON.parse(fs.readFileSync(stage+'/before.json'));
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
function quote(s){return "'"+String(s).replace(/'/g,"'\\''")+"'";}
function compare(a,b){if(!a)return -1;const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]<y[i]?-1:1;}return 0;}
function execute(bin,args){const p=cp.spawnSync(bin,args,{encoding:'utf8',maxBuffer:16777216,timeout:900000});const stdout=p.stdout||'',stderr=p.stderr||'';if(stdout)process.stdout.write(stdout);if(stderr)process.stderr.write(stderr);if(p.error||p.status!==0)throw Error('Store deploy failed ('+(p.status===null?'interrupted':p.status)+'): '+(p.error&&p.error.message||stderr.slice(-800)));return stdout;}
function atomic(p,v){fs.writeFileSync(p+'.new',JSON.stringify(v,null,2),{mode:0o600});fs.renameSync(p+'.new',p);}
function run(){
 if(require('os').hostname()==='rse'||!fs.existsSync('/usr/bin/icam2proxy')||process.getuid()!==0)throw Error('MGU/root required');
 if(before.boot!==fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim())throw Error('MGU restarted since preflight; run check again');
 if(!before.supported||!before.storeInstalled)throw Error('Unsupported preflight');
 for(const row of manifest.artifacts){const f=stage+'/'+row.name,b=fs.readFileSync(f);if(b.length!==row.bytes||sha(b)!==row.sha256)throw Error('Payload checksum '+row.name);}
 const fresh=JSON.parse(execute('/usr/bin/node',[stage+'/preflight-standalone.js']));if(!fresh.supported||!fresh.storeInstalled||fresh.boot!==before.boot)throw Error('Target changed since preflight; run check again');before=fresh;
 const changed=manifest.artifacts.filter(row=>compare(before.versions[row.id],row.version)<0);
 const record={schema:1,transaction:runId,status:'INSTALLING',before,planned:changed.map(r=>({id:r.id,version:r.version})),steps:[],automaticReboot:false,preservesArchive:true,preservesRsePairing:true};atomic(receipt,record);
 try{
  const deploy=changed.find(r=>r.id==='mgu-deploy');if(deploy){record.steps.push({id:deploy.id,status:'started'});atomic(receipt,record);execute('/usr/bin/node',[stage+'/bootstrap/mgu-deploy.js','install','--artifact',stage+'/'+deploy.name,'--skip-older','--yes']);record.steps[record.steps.length-1].status='installed';atomic(receipt,record);}
  const rest=changed.filter(r=>r.id!=='mgu-deploy');if(rest.length){const args=['check'];for(const r of rest)args.push('--artifact',stage+'/'+r.name);execute('/var/opt/mgu-deploy/mgu-deploy.sh',args);
   const install=['install','--skip-older','--yes'];for(const r of rest)install.push('--artifact',stage+'/'+r.name);record.steps.push({id:'recorder-components',status:'started'});atomic(receipt,record);execute('/var/opt/mgu-deploy/mgu-deploy.sh',install);record.steps[record.steps.length-1].status='installed';}
  const text=execute('/var/opt/mgu-deploy/mgu-deploy.sh',['status','--read-only','--json']);let status;try{status=JSON.parse(text);}catch(e){status={raw:text};}record.after=status;record.status=changed.length?'INSTALLED':'ALREADY_CURRENT';record.pendingReboot=Array.isArray(status.pending_reboot)?status.pending_reboot:status.reboot||null;atomic(receipt,record);console.log('RECORDER_RESULT '+JSON.stringify(record));
 }catch(e){record.status='INSTALL_FAILED';record.error=e.message;atomic(receipt,record);console.log('RECORDER_RESULT '+JSON.stringify(record));throw e;}
}
try{run();}catch(e){console.error(e.stack);process.exitCode=1;}
