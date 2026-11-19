'use strict';
// H.264 in MPEG-TS, one independently decodable AU per PES, no transcoding.
// Format reference: https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/mpegtsenc.c
const START=Buffer.from([0,0,0,1]);
function crc(b){let x=0xffffffff;for(let i=0;i<b.length;i++){x^=b[i]<<24;for(let j=0;j<8;j++)x=(x<<1)^((x&0x80000000)?0x04c11db7:0);}return x>>>0;}
function section(pid,hex,cc){const body=Buffer.from(hex,'hex'),p=Buffer.alloc(188,255);p[0]=0x47;p[1]=0x40|(pid>>8);p[2]=pid&255;p[3]=0x10|(cc&15);p[4]=0;body.copy(p,5);p.writeUInt32BE(crc(body),5+body.length);return p;}
class Mux{
 constructor(){this.cc=0;this.tables=0;this.frames=0;}
 frame(annex,pts){
  pts=Math.floor(pts)%8589934592;
  const head=Buffer.alloc(14);head[2]=1;head[3]=0xe0;head[6]=0x80;head[7]=0x80;head[8]=5;
  head[9]=0x21|((Math.floor(pts/1073741824)&7)<<1);head[10]=Math.floor(pts/4194304)&255;head[11]=((Math.floor(pts/32768)&127)<<1)|1;head[12]=Math.floor(pts/128)&255;head[13]=((pts&127)<<1)|1;
  const pes=Buffer.concat([head,annex]),tables=this.frames++%3===0;
  const packets=Math.ceil((pes.length+8)/184),out=Buffer.alloc((packets+(tables?2:0))*188,255);let off=0,at=0,first=true;
  if(tables){section(0,'00b00d0001c100000001f000',this.tables).copy(out,off);off+=188;section(4096,'02b0120001c10000e100f0001be100f000',this.tables++).copy(out,off);off+=188;}
  while(at<pes.length){const p=off;out[p]=0x47;out[p+1]=1|(first?0x40:0);out[p+2]=0;out[p+3]=0x10|(this.cc++&15);let pos=p+4;
   const take=Math.min(pes.length-at,first?176:184),pad=184-take;
   if(pad){out[p+3]|=0x20;out[pos++]=pad-1;if(pad>1){out[pos++]=first?0x50:0;if(first){out[pos++]=Math.floor(pts/33554432)&255;out[pos++]=Math.floor(pts/131072)&255;out[pos++]=Math.floor(pts/512)&255;out[pos++]=Math.floor(pts/2)&255;out[pos++]=((pts&1)<<7)|0x7e;out[pos++]=0;}pos=p+4+pad;}}
   pes.copy(out,pos,at,at+take);at+=take;off+=188;first=false;
  }
  return out.slice(0,off);
 }
}
function unpack(frame){
 const n=frame.readUInt32LE(0),count=frame.readUInt32LE(4);if(n!==frame.length-32||n>2*1024*1024||count<1||count>4096||frame.readUInt32LE(12)!==1)throw Error('AU bounds');
 let at=32,open=false,seq=null,ssrc=null;const parts=[];
 for(let i=0;i<count;i++){
  if(at+4>frame.length)throw Error('RTP length');const len=frame.readUInt32LE(at);at+=4;if(len<13||at+len>frame.length)throw Error('RTP bounds');const b=frame.slice(at,at+len);at+=len;
  let pos=12+4*(b[0]&15),end=len;if(b[0]>>6!==2||pos>end)throw Error('RTP version');if(b[0]&16){if(pos+4>end)throw Error('RTP extension');pos+=4+4*b.readUInt16BE(pos+2);}if(b[0]&32){if(!b[end-1]||b[end-1]>end-pos)throw Error('RTP padding');end-=b[end-1];}if(pos>=end)throw Error('RTP payload');
  const sn=b.readUInt16BE(2),ss=b.readUInt32BE(8);if(seq!==null&&(sn!==seq||ss!==ssrc))throw Error('RTP discontinuity');seq=(sn+1)&65535;ssrc=ss;if(b.readUInt32BE(4)!==frame.readUInt32LE(8))throw Error('RTP timestamp');
  const type=b[pos]&31;
  if(type>=1&&type<=23){if(open)throw Error('unfinished FU');parts.push(START,b.slice(pos,end));}
  else if(type===24){if(open)throw Error('unfinished FU');let p=pos+1;while(p+2<=end){const sz=b.readUInt16BE(p);p+=2;if(!sz||p+sz>end)throw Error('STAP bounds');parts.push(START,b.slice(p,p+sz));p+=sz;}if(p!==end)throw Error('STAP tail');}
  else if(type===28&&pos+2<end){const flags=b[pos+1];if(flags&128){if(open||flags&64)throw Error('FU start');open=true;parts.push(START,Buffer.from([(b[pos]&0xe0)|(flags&31)]));}else if(!open)throw Error('FU continuation');parts.push(b.slice(pos+2,end));if(flags&64)open=false;}
  else throw Error('RTP NAL type');
  if(!!(b[1]&128)!==(i===count-1))throw Error('RTP marker');
 }
 if(at!==frame.length||open)throw Error('Incomplete AU');return Buffer.concat(parts);
}
module.exports={Mux,unpack,crc};
