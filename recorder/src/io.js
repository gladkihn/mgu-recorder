'use strict';
const fs=require('fs');
const open=(p,flags,mode)=>new Promise((r,j)=>fs.open(p,flags,mode===undefined?0o600:mode,(e,fd)=>e?j(e):r(fd)));
const close=fd=>new Promise((r,j)=>fs.close(fd,e=>e?j(e):r()));
const sync=fd=>new Promise((r,j)=>fs.fdatasync(fd,e=>e?j(e):r()));
async function write(fd,b,pos){let at=0;while(at<b.length){const n=await new Promise((r,j)=>fs.write(fd,b,at,b.length-at,pos+at,(e,n)=>e?j(e):r(n)));if(!n)throw Error('Disk write made no progress');at+=n;}}
async function read(fd,len,pos){const b=Buffer.alloc(len);let at=0;while(at<len){const n=await new Promise((r,j)=>fs.read(fd,b,at,len-at,pos+at,(e,n)=>e?j(e):r(n)));if(!n)break;at+=n;}return b.slice(0,at);}
const truncate=(fd,n)=>new Promise((r,j)=>fs.ftruncate(fd,n,e=>e?j(e):r()));
module.exports={open,close,sync,write,read,truncate};
