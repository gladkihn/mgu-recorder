'use strict';
// Read-only, bounded metadata for this reviewed icam2proxy build. No ptrace or writes.
const fs=require('fs'),crypto=require('crypto');
const HASH='a93f332c1ce41783ea25b3b5215f2c941e3f87bdca235590f801df4d6d13d363';
class Ownership{
 constructor(o){this.fs=o&&o.fs||fs;this.hash=o&&o.hash||((b)=>crypto.createHash('sha256').update(b).digest('hex'));this.cache=null;}
 locate(){const f=this.fs;let pid=this.cache&&this.cache.pid;if(pid){try{if(f.readlinkSync('/proc/'+pid+'/exe')!=='/usr/bin/icam2proxy')pid=null;}catch(e){pid=null;}}if(!pid){const ids=f.readdirSync('/proc').filter(n=>/^\d+$/.test(n));if(ids.length>4096)throw Error('Process bound');const a=ids.filter(n=>{try{return f.readlinkSync('/proc/'+n+'/exe')==='/usr/bin/icam2proxy';}catch(e){return false;}});if(a.length!==1)throw Error('Camera proxy identity unavailable');pid=a[0];}
  const start=f.readFileSync('/proc/'+pid+'/stat','utf8').replace(/^.*\) /,'').split(' ')[19],identity=pid+':'+start;
  if(!this.cache||this.cache.identity!==identity){if(this.hash(f.readFileSync('/proc/'+pid+'/exe'))!==HASH)throw Error('Unsupported camera proxy build');this.cache={pid,identity};}
  const maps=f.readFileSync('/proc/'+pid+'/maps','utf8').trim().split('\n').map(l=>{const a=l.trim().split(/\s+/),r=a[0].split('-');return {lo:parseInt(r[0],16),hi:parseInt(r[1],16),offset:parseInt(a[2],16),permissions:a[1],path:a.slice(5).join(' ')};});const bases=maps.filter(m=>m.path==='/usr/bin/icam2proxy'&&m.offset===0);if(bases.length!==1)throw Error('Camera proxy load bias');return {pid,identity,maps,base:bases[0].lo};
 }
 snapshot(){const f=this.fs,v=this.locate(),fd=f.openSync('/proc/'+v.pid+'/mem','r');let bytes=0;
  const pointer=(b,o)=>{const n=b.readUInt32LE(o)+b.readUInt32LE(o+4)*4294967296;if(!Number.isSafeInteger(n)||n>=281474976710656)throw Error('Invalid pointer');return n;};
  const read=(address,length)=>{if(!v.maps.some(m=>m.permissions[0]==='r'&&address>=m.lo&&address+length<=m.hi)||bytes+length>1200)throw Error('Ownership read bound');bytes+=length;const b=Buffer.alloc(length);if(f.readSync(fd,b,0,length,address)!==length)throw Error('Short ownership read');return b;};
  try{const address=v.base+0x371820,h=read(address,48),count=pointer(h,40);if(count>16)throw Error('Client bound');const todo=pointer(h,16)?[pointer(h,16)]:[],seen={},clients=[],types={CLIENT_DIRECT:0,CLIENT_INDIRECT:0};while(todo.length){const a=todo.pop();if(seen[a]||clients.length>=count)throw Error('Unstable client tree');seen[a]=true;const b=read(a,56),type=b.readUInt32LE(48);if(type!==0&&type!==1)throw Error('Unknown client type');const name=type?'CLIENT_INDIRECT':'CLIENT_DIRECT';clients.push({cookie:b.readUInt32LE(32),type:name});types[name]++;for(const offset of [16,24]){const p=pointer(b,offset);if(p)todo.push(p);}}
   const state=offset=>{const b=read(v.base+offset,40);return {application:b.readUInt32LE(32),mode:b.readUInt32LE(16),perspective:b[0]};};const nativeCurrent=state(0x3717a0),lastIndirectRequest=state(0x3717e0),lastRequestWasIndirect=read(v.base+0x371780,1)[0];if(!h.equals(read(address,48))||clients.length!==count)throw Error('Concurrent ownership change');return {pid:Number(v.pid),identity:v.identity,attached:count,clients,types,nativeCurrent,lastIndirectRequest,lastRequestWasIndirect,bytesRead:bytes,stable:true};
  }finally{f.closeSync(fd);}
 }
}
function exclusive(s,cookie){return !!(s&&s.stable&&Number.isInteger(cookie)&&s.attached===1&&s.clients.length===1&&s.clients[0].cookie===cookie&&s.clients[0].type==='CLIENT_INDIRECT'&&s.lastRequestWasIndirect===1&&s.nativeCurrent.application===1&&s.nativeCurrent.mode===1&&s.nativeCurrent.perspective===1);}
module.exports={Ownership,exclusive,HASH};
