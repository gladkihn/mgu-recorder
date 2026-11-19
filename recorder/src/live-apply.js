'use strict';
// Store activation: disposable workers change; supervised parents remain resident.
const fs=require('fs'),path=require('path'),cp=require('child_process'),{handoff}=require('./legacy-handoff');
function atomic(file,data){const temp=file+'.owner-stage';fs.writeFileSync(temp,data,{mode:0o644});fs.renameSync(temp,file);}
function apply(){const root=path.resolve(__dirname,'..');require('./capabilities').requireSupport();handoff('activate');console.log(JSON.stringify(require('./camera-migration').change('activate')));require('./pairing').ensure();
 let main=0;try{main=Number(cp.execFileSync('systemctl',['show','owner-dvr.service','-p','MainPID','--value'],{encoding:'utf8',timeout:2000}).trim());}catch(e){}
 if(main>0){let children=[];try{children=fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n)).filter(n=>{try{return new RegExp('^PPid:\\s*'+main+'$','m').test(fs.readFileSync('/proc/'+n+'/status','utf8'));}catch(e){return false;}}).map(Number);}catch(e){}for(const pid of children){if(!pid)continue;let argv;try{argv=fs.readFileSync('/proc/'+pid+'/cmdline','utf8').split('\0');}catch(e){continue;}const script=argv.find(v=>/^\/var\/opt\/owner-dvr\/versions\/[^/]+\/src\/service\.js$/.test(v));if(!script)continue;require('./device-config').preserveLegacyOffset(script);process.kill(pid,'SIGTERM');}}
 console.log(JSON.stringify({status:'Independent recorder installed; shared camera lease and disposable workers updated'}));}
if(require.main===module){try{apply();}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={apply};
