'use strict';
const cp=require('child_process'),path=require('path'),EventEmitter=require('events');
class PlatformClient extends EventEmitter{
 constructor(o){super();this.o=o||{};this.state={ignition:null,vehicleAvailable:false,speedRaw:null,speedAt:0,scene:null,sceneAt:0};this.stopped=false;this.want=false;this.child=null;this.pending=new Map();this.serial=0;}
 async start(){this.launch();return this;}
 launch(){if(this.stopped||this.child)return;const host=path.join(__dirname,'platform-host.js'),helper=this.o.helper,c=this.o.spawn?this.o.spawn():cp.spawn(helper,['low-priority','--','/usr/bin/node',host],{stdio:['ignore','ignore','pipe','ipc']});this.child=c;this.sent=null;let ready=false;
  const watchdog=setTimeout(()=>{if(this.child===c&&!ready)c.kill('SIGKILL');},16000);
  c.stderr.on('data',b=>this.emit('diagnostic',b.toString()));c.on('error',e=>this.emit('diagnostic',e.message));
  c.on('message',m=>{if(this.child!==c||!m)return;if(m.type==='reply'){const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);}}if(m.type==='ready'){ready=true;clearTimeout(watchdog);this.sendWanted();}if(m.type==='state'&&m.state&&typeof m.state==='object'){this.state=m.state;this.emit('state',this.state);}if(m.type==='error')this.emit('diagnostic',m.message);});
  c.on('close',()=>{clearTimeout(watchdog);if(this.child!==c)return;this.child=null;this.sent=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Camera adapter exited'));}this.pending.clear();this.state=Object.assign({},this.state,{ignition:null,vehicleAvailable:false,speedRaw:null,scene:null,sceneAt:0,clock:null});this.emit('state',this.state);if(!this.stopped)this.retry=setTimeout(()=>this.launch(),2000);});}
 sendWanted(){if(!this.child||!this.child.connected||this.sent===this.want)return;this.sent=this.want;try{this.child.send({op:'request',on:this.want},e=>{if(e)this.sent=null;});}catch(e){this.sent=null;}}
 restoreLines(){const c=this.child;if(!c||!c.connected)return Promise.reject(Error('Camera adapter unavailable'));const id=++this.serial;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Line restoration timeout'));},3500);this.pending.set(id,{resolve,reject,timer});try{c.send({op:'restoreLines',id},e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
 async request(on){this.want=!!on;this.sendWanted();}
 async stop(){this.stopped=true;clearTimeout(this.retry);const c=this.child;if(!c)return;await new Promise(resolve=>{let done=false;const end=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};c.once('close',end);const timer=setTimeout(()=>{c.kill('SIGKILL');end();},7000);try{c.send({op:'stop'},e=>{if(e)c.kill('SIGKILL');});}catch(e){c.kill('SIGKILL');}});}
}
module.exports={PlatformClient};
