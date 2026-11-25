'use strict';
// This watchdog restores both visual overlays independently of the camera parent.
const fs=require('fs'),path=require('path'),{Guidelines,Journal,reason}=require('./guidelines'),{Ownership}=require('./camera-ownership'),{ParkingGuard}=require('./parking-guard'),cat=require('./catalog'),{SurfaceWatch}=require('./surface-watch'),{observe}=require('./observed-fields');
const sm=require('/usr/lib/oap-mainapp/node_modules/someip.node'),raw=JSON.parse(fs.readFileSync('/etc/oap/someip/someip-interfaces.json')),guard=new ParkingGuard(),reader=new Ownership();
const definitions=[{key:'trajectories',field:'Trajectories',journal:'guidelines-restore.json'},{key:'obstacles',field:'ObstacleIdentification',journal:'obstacles-restore.json'}],entries=[],missing={};
let xv=null,cam=null,surface=null,camFields=null,xvFields=null,operational=false,beat=0,target=null,readyFrames=false,stopping=false,busy=false,again=false,restoring=0,closing=null,lastState='';
const now=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};
function send(m){if(process.connected)try{process.send(m,()=>{});}catch(e){}}
function report(){const state={mode:'ready',parkingGuard:guard.snapshot()};for(const d of definitions){const item=entries.find(e=>e.key===d.key);state[d.key]=item?Object.assign({},item.model.state):missing[d.key]||{mode:'starting'};if(state[d.key].mode==='unavailable'||state[d.key].error)state.mode='unavailable';}const s=JSON.stringify(state);if(s!==lastState){lastState=s;send({type:'state',state});}}
async function build(name,fields){const c=cat.select(raw,name,fields,[]),p=await sm.buildProxy(c,c.instances['1']?'1':Object.keys(c.instances)[0]);await p.init();await p.waitUntilAvailable();return p;}
function changed(){for(const e of entries)try{e.model.observe(e.channel.read());}catch(error){}reconcile().catch(e=>send({type:'error',message:e.message}));}
async function reconcile(){if(stopping||!operational||restoring)return;if(busy){again=true;return;}busy=true;again=false;try{
 const cookie=!stopping&&readyFrames&&now()-beat<1000?target:null;
 for(const e of entries)e.model.target(cookie);
 if(cookie!==null&&guard.snapshot().allowed){try{reader.update(cookie,camFields.currentState.read(),xvFields.CurrentState.read(),camFields.cameraProxyState.read());}catch(e){reader.invalidate();}}else reader.invalidate();
 await Promise.all(entries.map(e=>e.model.tick()));report();
 }finally{busy=false;if(again&&!stopping&&!restoring)setImmediate(()=>reconcile().catch(e=>send({type:'error',message:e.message})));}}
async function restore(final){target=null;readyFrames=false;if(!entries.length&&!operational)throw Error('Overlay controller not ready');restoring++;try{while(busy)await new Promise(r=>setTimeout(r,10));busy=true;try{
 const errors=[];await Promise.all(entries.map(async e=>{e.model.target(null);try{await e.model.restore();if(final)await e.model.finishRestore();}catch(error){e.model.state.error=error.message;e.model.state.reason=reason(error);e.model.state.mode='unavailable';errors.push(error);}}));report();if(errors.length)throw errors[0];
 }finally{busy=false;}}finally{restoring--;}}
async function stop(){if(closing)return closing;stopping=true;clearInterval(timer);if(surface)surface.stop();closing=(async()=>{let error=null;try{await restore(true);}catch(e){error=e.message;}for(const p of [xv,cam])if(p)try{await p.shutdown();}catch(e){}send({type:'closed',error});process.exit(error?1:0);})();return closing;}
process.stderr.on('error',()=>{});process.on('message',m=>{if(!m||stopping)return;if(m.op==='lease'){beat=now();const cookie=Number.isInteger(m.cookie)&&m.cookie>=0?m.cookie:null,ready=m.ready===true,update=cookie!==target||ready!==readyFrames;target=cookie;readyFrames=ready;if(update)changed();}else if(m.op==='restore'){restore().then(()=>send({type:'reply',id:m.id,result:true}),e=>send({type:'reply',id:m.id,error:e.message}));}else if(m.op==='stop')stop();});process.on('disconnect',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
const timer=setInterval(()=>reconcile().catch(e=>send({type:'error',message:e.message})),200);
(async()=>{
 const available=[];for(const d of definitions){try{const f=cat.select(raw,'de.bmw.dass.XView3D',[d.field],[]).fields[d.field];if(!f.getter||!f.setter||!f.event||f.schema.t!=='Enum'||f.schema.e.ON!==1||f.schema.e.OFF!==0)throw Error('Target lacks overlay field');available.push(d.field);}catch(e){missing[d.key]={mode:'unavailable',error:'Target lacks overlay field',reason:'FIELD',restorationPending:fs.existsSync(path.join('/var/opt/owner-dvr',d.journal))};}}
 cam=await build('de.bmw.infotainment.video.cameraproxy.ICAM2Proxy',['currentState','cameraProxyState']);xv=await build('de.bmw.dass.XView3D',['CurrentState'].concat(available));
 camFields=await observe(cam,['currentState','cameraProxyState'],changed);xvFields=await observe(xv,['CurrentState'].concat(available),changed);
 for(const d of definitions){if(available.indexOf(d.field)<0)continue;const channel=xvFields[d.field],model=new Guidelines({journal:new Journal(path.join('/var/opt/owner-dvr',d.journal),d.field),confirmMs:1500,read:()=>channel.read(),write:v=>channel.write(v),ownership:()=>reader.snapshot(),allowed:()=>!stopping&&readyFrames&&now()-beat<1000&&guard.snapshot().allowed});entries.push({key:d.key,model,channel});}
 busy=true;try{await Promise.all(entries.map(async e=>{try{await e.model.recover();}catch(error){e.model.state={mode:'unavailable',error:error.message,reason:reason(error),restorationPending:true};}}));}finally{busy=false;}
 surface=new SurfaceWatch();surface.on('state',v=>{guard.surface(v.known?v.active:null);changed();});await surface.start();operational=true;send({type:'ready'});report();if(stopping)await stop();else await reconcile();
})().catch(async e=>{send({type:'error',message:e.message});stopping=true;clearInterval(timer);try{await restore();}catch(error){send({type:'error',message:error.message});}process.exit(1);});
