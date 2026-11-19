'use strict';
// Stock ivi-control getters only. No visibility/rectangle/layer mutation is sent.
const cp=require('child_process'),EventEmitter=require('events'),path=require('path');
function parse(text){const id=/^surface\s+(\d+)\s*$/m.exec(text),visible=/^\s*visibility:\s*([01])\s*$/m.exec(text),process=/^\s*process:\s*(.+)\s*$/m.exec(text);if(!id||Number(id[1])!==408||!visible||!process||!/^\/usr\/bin\/(dasvideo|cameraplayer)\b/.test(process[1]))throw Error('Native camera surface identity unavailable');return {known:true,active:visible[1]==='1',source:'ivi-camera-surface-0x198',process:process[1].trim()};}
class SurfaceWatch extends EventEmitter{
 constructor(o){super();this.o=o||{};this.exec=this.o.exec||cp.execFile;this.stopped=false;this.state={known:false,active:null,source:'ivi-camera-surface-0x198'};this.key='';}
 async start(){await this.sample();return this;}
 async sample(){if(this.stopped||this.busy)return;this.busy=true;let next;try{next=await new Promise((resolve,reject)=>{this.child=this.exec(this.o.helper||path.resolve(__dirname,'../native/dvr-io'),['low-priority','--','/usr/bin/ivi-control','surface','408'],{env:Object.assign({},process.env,{XDG_RUNTIME_DIR:'/run/wayland',WAYLAND_DISPLAY:'wayland-0'}),encoding:'utf8',timeout:1200,maxBuffer:8192},(error,text)=>{if(error)return reject(error);try{resolve(parse(text));}catch(e){reject(e);}});});}catch(e){next={known:false,active:null,source:'ivi-camera-surface-0x198',error:e.message};}finally{this.child=null;this.busy=false;}if(this.stopped)return;this.state=next;const key=JSON.stringify(next);if(key!==this.key){this.key=key;this.emit('state',next);}if(!this.o.once)this.timer=setTimeout(()=>this.sample(),250);}
 stop(){this.stopped=true;clearTimeout(this.timer);if(this.child)this.child.kill('SIGTERM');}
}
module.exports={SurfaceWatch,parse};
