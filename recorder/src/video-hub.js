'use strict';
const fs=require('fs'),net=require('net'),EventEmitter=require('events'),wire=require('./video-wire'),policy=require('./source-policy');
class VideoHub extends EventEmitter{
 constructor(){super();this.clients=new Set();this.sequence=0;this.source={version:1,ready:false,kind:'waiting',title:'Ожидание камеры'};this.frames=0;}
 get count(){return this.clients.size;}
 attach(c){if(this.clients.size>=8)return false;this.clients.add(c);c.sender.send(1,this.source);this.emit('demand');return true;}
 detach(c){if(this.clients.delete(c))this.emit('demand');}
 listen(file,uid){if(fs.existsSync(file)){const st=fs.lstatSync(file);if(!st.isSocket())throw Error('Unsafe video socket');fs.unlinkSync(file);}this.server=net.createServer(s=>{if(this.clients.size>=8){s.destroy();return;}const c={socket:s,sender:new wire.Sender(s)};this.attach(c);s.setTimeout(2500,()=>s.destroy());s.on('data',b=>{if(b.length>64||!/^C+$/.test(b.toString()))s.destroy();});s.on('error',()=>{});s.on('close',()=>{this.detach(c);});});this.server.listen(file,()=>{if(process.platform!=='win32'){fs.chmodSync(file,0o660);fs.chownSync(file,0,uid);}});return this.server;}
 update(s){const n=s.native||{},a=n.icam,b=n.xview,ready=n.ready;this.source=Object.assign({version:1,state:a,xview:b,proxy:ready,speedRaw:s.speedRaw,huMonoMs:wire.mono()},policy.classify(a,b,ready));if(!s.scene||Date.now()-(s.sceneAt||0)>400)Object.assign(this.source,{ready:false,kind:'waiting',title:'Ожидание камеры'});for(const c of this.clients)c.sender.send(1,this.source);}
 frame(raw){if(!raw||!this.source.ready||!this.clients.size)return;const frame=Buffer.from(raw),seq=++this.sequence;frame.writeUInt32LE(seq%4294967296,24);frame.writeUInt32LE(Math.floor(seq/4294967296),28);for(const c of this.clients)c.sender.send(2,frame);this.frames++;}
 close(){for(const c of this.clients)c.socket.destroy();if(this.server)this.server.close();}
}
module.exports={VideoHub};
