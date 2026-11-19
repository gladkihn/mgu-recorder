'use strict';
function recorderCapabilities(){const c={exports:{}};(function(module,exports,require){
'use strict';
// Schema selection is performed from the target's own catalogue, never a donor VIN.
function schema(c,n,extra){const a=c.datatypes[n];let r;if(!a){r={t:n};}else if(a.type==='typedef'){r=schema(c,a.dataRef);}else if(a.type==='struct'){r={t:'Struct',e:a.members.map(m=>Object.assign({n:m.name},schema(c,m.dataRef,m)))};}else if(a.type==='enum'){r={t:'Enum',e:a.items};if(a.enumWidth)r.w=a.enumWidth;}else throw Error('Unsupported catalogue type '+n);if(extra&&extra.defaultValue!==undefined)r.d=extra.defaultValue;return r;}
function flattened(c,name,depth){const a=c.interfaces[name];if(!a||(depth||0)>8)throw Error('Target interface inheritance '+name);if(!a.extends)return a;const p=flattened(c,a.extends,(depth||0)+1);return Object.assign({},a,{fields:Object.assign({},p.fields,a.fields),methods:Object.assign({},p.methods,a.methods),events:Object.assign({},p.events,a.events)});}
function select(c,name,fields,methods){const a=flattened(c,name);const r={name:a.name,serviceId:a.serviceId,version:a.version,instances:c.instanceIDs[name]||{'1':1},fields:{},methods:{},events:{},eventGroups:{fields:{},events:{}}};for(const n of fields){const f=a.fields[n];if(!f)throw Error('Target lacks '+name+'.'+n);const out={schema:schema(c,f.dataRef)};if(f.getter&&f.getter.id)out.getter={id:f.getter.id};if(f.setter&&f.setter.id)out.setter={id:f.setter.id};if(f.notifier){out.event={id:f.notifier.id,groups:f.notifier.eventgroups};r.eventGroups.fields[f.notifier.id]=f.notifier.eventgroups;}r.fields[n]=out;}
 for(const n of methods||[]){const m=a.methods[n];if(!m)throw Error('Target lacks method '+n);r.methods[n]={id:m.methodId,schema:m.inputs&&m.inputs.length?{t:'Struct',e:m.inputs.map(x=>Object.assign({n:x.name},schema(c,x.dataRef,x)))}:{},retSchema:m.outputs&&m.outputs.length?{t:'Struct',e:m.outputs.map(x=>Object.assign({n:x.name},schema(c,x.dataRef,x)))}:{}};}
 return r;}
module.exports={schema,select};

})(c,c.exports,require);const a={exports:{}};(function(module,exports,require){
'use strict';
// Reads the target ABI and catalogue; sends no vehicle/control requests.
const fs=require('fs'),os=require('os'),cat=require('./catalog');
function inspect(o){o=o||{};const f=o.fs||fs,arch=o.arch||os.arch(),errors=[];
 if(arch!=='x64')errors.push('Recorder requires x86_64 MGU');
 for(const p of ['/usr/bin/icam2proxy','/usr/bin/ivi-control','/usr/lib/oap-mainapp/node_modules/someip.node','/lib/ld-linux-x86-64.so.2'])if(!f.existsSync(p))errors.push('Target lacks '+p);
 try{if(f.statSync('/mnt/share').dev===f.statSync('/var/opt').dev)errors.push('HDD is not mounted');}catch(e){errors.push('HDD mount unavailable');}
 try{const c=JSON.parse(f.readFileSync('/etc/oap/someip/someip-interfaces.json'));
  cat.select(c,'de.bmw.infotainment.video.cameraproxy.ICAM2Proxy',['currentState','cameraProxyState'],['clientAttach','clientDetach','changeState']);
  cat.select(c,'de.bmw.dass.XView3D',['CurrentState'],[]);
  cat.select(c,'de.bmw.infrastructure.VehicleCondition',['vehicleConditionNoCrc'],[]);
 }catch(e){errors.push('Camera/vehicle catalogue: '+e.message);}
 return {supported:!errors.length,errors,vinRequired:false,firmwareChanged:false};
}
function requireSupport(o){const r=inspect(o);if(!r.supported)throw Error(r.errors.join('; '));return r;}
module.exports={inspect,requireSupport};

})(a,a.exports,n=>n==='./catalog'?c.exports:require(n));return a.exports.inspect();}
const recorderInstallerInline=true;
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
