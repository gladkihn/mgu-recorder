'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),EventEmitter=require('events');
const root=path.resolve(__dirname,'../recorder'),src=n=>require(path.join(root,'src',n));
const {Guidelines,Journal}=src('guidelines'),{ObservedField}=src('observed-fields'),{ParkingGuard}=src('parking-guard'),cat=src('catalog'),diagnostics=require(path.join(root,'ui/diagnostics'));
const catalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../live-rse-v15/rse-oap-original/etc/oap/someip/someip-interfaces.json'))),front=src('policy').REQUEST;
const flush=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));};
async function watchdog(mode){
 let time=1000,exit=null,reads=0,parkSurface;const calls=[],messages=[],timers=[],journals={},handlers={};
 const values={currentState:front,cameraProxyState:'CAMERA_READY',CurrentState:front,Trajectories:mode==='already-off'?'OFF':'ON',ObstacleIdentification:'ON'};
 const proc=new EventEmitter();proc.connected=true;proc.send=(m,cb)=>{messages.push(JSON.parse(JSON.stringify(m)));if(cb)cb();};proc.stderr=new EventEmitter();proc.hrtime=()=>[Math.floor(time/1000),(time%1000)*1e6];proc.exit=n=>{exit=n;};
 class J{constructor(file){this.file=file;}load(){return journals[this.file]||null;}save(original){assert(!journals[this.file]);journals[this.file]={schema:2,original};}clear(){delete journals[this.file];}}
 class G extends Guidelines{constructor(o){super(Object.assign({},o,{now:()=>time,confirmMs:0,finalHoldMs:0,finalLimitMs:0,handoffQuietMs:0}));}}
 class P extends ParkingGuard{constructor(){super({now:()=>time,quietMs:0});}}
 class S extends EventEmitter{async start(){parkSurface=active=>this.emit('state',{known:true,active});parkSurface(false);return this;}stop(){}}
 const native={buildProxy(c){const p={init:async()=>{},waitUntilAvailable:async()=>{},shutdown:async()=>{},subscribe:async o=>{handlers[o.name]=o.onReceive;},subscribeToAvailability:async fn=>fn(true),getValue:async name=>{reads++;return values[name];},setValue:async(name,value)=>{calls.push([name,value]);if(mode==='fail-boxes'&&name==='ObstacleIdentification'&&value==='OFF')throw Object.assign(Error('permission denied'),{code:'EACCES'});values[name]=value;handlers[name](value);}};return p;}};
 const fixture=JSON.parse(JSON.stringify(catalog));if(mode==='missing-boxes')delete fixture.interfaces['de.bmw.dass.XView3D'].fields.ObstacleIdentification;
 const load=n=>n==='fs'?{readFileSync:()=>JSON.stringify(fixture),existsSync:()=>false}:n==='path'?path:n==='./guidelines'?{Guidelines:G,Journal:J,reason:src('guidelines').reason}:n==='./parking-guard'?{ParkingGuard:P}:n==='./camera-ownership'?{Ownership:class extends src('camera-ownership').Ownership{constructor(){super({now:()=>time});}}}:n==='./surface-watch'?{SurfaceWatch:S}:n==='./catalog'?cat:n==='./observed-fields'?src('observed-fields'):n.endsWith('someip.node')?native:require(n);
 const context={require:load,process:proc,setInterval:fn=>{timers.push(fn);return timers.length;},clearInterval:()=>{},setTimeout,clearTimeout,setImmediate,console};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/guidelines-host.js'),'utf8'),context);await flush();assert(messages.some(m=>m.type==='ready'));
 proc.emit('message',{op:'lease',cookie:7,ready:true});await flush();assert.equal(values.Trajectories,'OFF');
 if(mode==='fail-boxes'){assert.equal(values.ObstacleIdentification,'ON');const st=messages.filter(m=>m.type==='state').pop().state;assert(diagnostics.runtime({guidelines:st}).includes('D_BOXES'));assert(diagnostics.runtime({guidelines:st}).includes('ACCESS'));}
 else if(mode==='missing-boxes'){const st=messages.filter(m=>m.type==='state').pop().state;assert(diagnostics.runtime({guidelines:st}).includes('D_BOXES'));assert(diagnostics.runtime({guidelines:st}).includes('FIELD'));assert(!calls.some(c=>c[0]==='ObstacleIdentification'));}
 else assert.equal(values.ObstacleIdentification,'OFF');
 if(mode==='already-off'){const st=messages.filter(m=>m.type==='state').pop().state;assert.equal(diagnostics.runtime({guidelines:st}),'');assert(!calls.some(c=>c[0]==='Trajectories'));}
 const count=reads,writeCount=calls.length;for(let i=0;i<100;i++){await timers[0]();await flush();}assert.equal(reads,count,'steady state does not poll SOME/IP getters');assert.equal(calls.length,writeCount,'steady state does not repeat setters');
 if(mode==='disconnect'){proc.connected=false;proc.emit('disconnect');await flush();assert.equal(exit,0);}
 else if(mode==='heartbeat'){time+=1200;await timers[0]();await flush();}
 else {parkSurface(true);await flush();}
 assert.equal(values.Trajectories,mode==='already-off'?'OFF':'ON');assert.equal(values.ObstacleIdentification,'ON');
 if(mode==='already-off')assert(!calls.some(c=>c[0]==='Trajectories'));
 if(exit===null){proc.emit('SIGTERM');await flush();assert.equal(exit,0);}assert.equal(Object.keys(journals).length,0);
 return {mode,initialReads:count,setters:calls.length,steadyStateExtraReads:0};
}
(async()=>{
 const results=[];for(const mode of ['parkmenu','disconnect','heartbeat','already-off','fail-boxes','missing-boxes'])results.push(await watchdog(mode));
 let gets=0,sets=0;const callbacks={};let actual='ON';const proxy={getValue:async()=>{gets++;return actual;},setValue:async(n,v)=>{sets++;actual=v;callbacks.value(v);}};
 const field=new ObservedField(proxy,'Trajectories',()=>{});callbacks.value=v=>field.receive(v);await field.refresh();await field.write('OFF');assert.equal(gets,1);assert.equal(sets,1);for(let i=0;i<1000;i++)assert.equal(field.read(),'OFF');assert.equal(gets,1);field.unavailable();assert.throws(()=>field.read());
 assert.equal(diagnostics.runtime({guidelines:{mode:'ready',trajectories:{mode:'already-off',error:null},obstacles:{mode:'suppressed',error:null}}}), '');
 const quiet=new Guidelines({journal:{load:()=>null},ownership:()=>null,allowed:()=>false});quiet.state={mode:'unavailable',error:'stale failure',reason:'TIMEOUT',restorationPending:false};quiet.observe('OFF');assert.equal(quiet.state.error,null);assert.equal(diagnostics.runtime({guidelines:{trajectories:quiet.state}}),'');
 assert(diagnostics.runtime({guidelines:{trajectories:{mode:'unavailable',error:'timeout',reason:'TIMEOUT'},obstacles:{mode:'suppressed'}}}).includes('D_LINES] TIMEOUT'));
 const dir=fs.mkdtempSync(path.join(__dirname,'journals-')),file=path.join(dir,'restore.json');fs.writeFileSync(file,JSON.stringify({schema:2,owner:'owner-dvr',original:'ON'}));const old=new Journal(file);assert.equal(old.load().original,'ON');old.clear();const boxes=new Journal(file,'ObstacleIdentification');boxes.save('ON');assert.equal(new Journal(file,'ObstacleIdentification').load().original,'ON');assert.throws(()=>new Journal(file,'Trajectories').load());boxes.clear();
 const report={status:'PASS',carAccessed:false,results,checks:['Both overlays suppressed only with an eligible recorder lease and hidden OEM camera','OEM parking visibility, heartbeat loss and parent disconnect restore both preferences','Pre-existing OFF is preserved; missing/denied obstacle control does not break trajectory control','Subscriptions replace repeated camera-state reads; no repeated steady-state setters','Distinct line/obstacle diagnostics, quiet success, write confirmation by notification','Legacy line journal readable; obstacle journal cannot be confused with trajectory journal']};fs.writeFileSync(path.join(__dirname,'RESULT.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
