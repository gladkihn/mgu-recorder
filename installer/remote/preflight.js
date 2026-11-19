'use strict';
// Read-only identification and compatibility check. No UDS/control calls.
const fs=require('fs'),os=require('os'),crypto=require('crypto');
function readJson(p){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){return null;}}
function version(p,id){const v=readJson(p);return v&&v.id===id?v.version:null;}
function get(){
 const state=readJson('/var/opt/mgu-deploy/state.json')||{},versions={},errors=[];
 for(const id of ['mgu-deploy','mgu-render','owner-dvr']){versions[id]=state.tools&&state.tools[id]&&state.tools[id].version||version('/var/opt/'+id+'/current/component.json',id)||null;}
 const apps=state.apps||{};let store=apps.robertn_store&&apps.robertn_store.version||null,app=apps.owner_dvr&&apps.owner_dvr.version||null;
 const base='/var/opt/public/oap';try{for(const n of fs.readdirSync(base).filter(n=>/^oap_\d+$/.test(n))){const p=readJson(base+'/'+n+'/source/package.json');if(p&&p.name==='robertn_store')store=store||p.version;if(p&&p.name==='owner_dvr')app=app||p.version;}}catch(e){}
 versions.owner_dvr=app;const storeInstalled=!!store,deployPresent=fs.existsSync('/var/opt/mgu-deploy/mgu-deploy.sh');
 let hmi=null;if(fs.existsSync('/usr/lib/oap-mainapp')&&!fs.existsSync('/usr/lib/oap-mainapp21'))hmi='ID7';else if(fs.existsSync('/usr/lib/oap-mainapp21')&&!fs.existsSync('/usr/lib/oap-mainapp'))hmi='ID8';
 else try{for(const n of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))){const c=fs.readFileSync('/proc/'+n+'/comm','utf8').trim();if(c==='HmiMain3D'){hmi='ID7';break;}if(c==='Hmi8'){hmi='ID8';break;}}}catch(e){}
 if(os.hostname()==='rse')errors.push('Target is rear entertainment, not MGU');if(process.getuid()!==0)errors.push('Root authorization required');if(hmi!=='ID7')errors.push('Only MGU ID7 is supported');if(!storeInstalled||!deployPresent)errors.push('MGU Store is not installed');const node=process.versions.node.split('.').map(Number);if(node[0]<8||node[0]===8&&node[1]<7)errors.push('Node 8.7 or newer required on MGU');
 const removalSupported=errors.length===0&&os.hostname()==='mgu';
 let caps;try{caps=typeof recorderCapabilities==='function'?recorderCapabilities():{supported:false,errors:['Capability reader missing']};}catch(e){caps={supported:false,errors:['Capability reader failed: '+e.message]};}errors.push.apply(errors,caps.errors||[]);
 return {schema:1,sshConnected:true,authorized:true,storeInstalled,storeVersion:store,hmi,arch:os.arch(),versions,boot:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim(),capabilities:caps,removalSupported,supported:errors.length===0,errors};
}
if(require.main===module||typeof recorderInstallerInline!=='undefined')console.log(JSON.stringify(get()));
module.exports={get};
