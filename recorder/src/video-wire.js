'use strict';
const MAX=2*1024*1024+32;
function packet(type,data){if(!Buffer.isBuffer(data))data=Buffer.from(JSON.stringify(data));if(data.length>MAX||type!==1&&type!==2)throw Error('wire bounds');const h=Buffer.alloc(5);h[0]=type;h.writeUInt32LE(data.length,1);return Buffer.concat([h,data]);}
class Reader{constructor(emit){this.pending=Buffer.alloc(0);this.emit=emit;}push(b){if(this.pending.length+b.length>MAX+65541)throw Error('wire buffer bound');this.pending=Buffer.concat([this.pending,b]);while(this.pending.length>=5){const t=this.pending[0],n=this.pending.readUInt32LE(1);if((t!==1&&t!==2)||n>MAX||t===1&&n>8192)throw Error('wire header');if(this.pending.length<5+n)return;const p=this.pending.slice(5,5+n);this.pending=this.pending.slice(5+n);this.emit(t,p);}}}
function mono(){const t=process.hrtime();return t[0]*1000+t[1]/1e6;}
class Sender{constructor(stream){this.stream=stream;this.blocked=false;this.latest=null;this.status=null;stream.on('drain',()=>{this.blocked=false;this.flush();});}send(t,b){if(this.blocked){if(t===1)this.status=b;else this.latest={b,at:mono()};return;}this.blocked=!this.stream.write(packet(t,b));}flush(){if(this.blocked)return;if(this.status){const b=this.status;this.status=null;this.send(1,b);}if(!this.blocked&&this.latest){const v=this.latest;this.latest=null;if(mono()-v.at<120)this.send(2,v.b);}}}
module.exports={MAX,packet,Reader,Sender,mono};
