'use strict';
const table=new Uint32Array(256);for(let n=0;n<256;n++){let x=n;for(let j=0;j<8;j++)x=(x>>>1)^((x&1)?0xedb88320:0);table[n]=x>>>0;}
function crc(b,start,end){let x=0xffffffff;start=start||0;end=end===undefined?b.length:end;for(let i=start;i<end;i++)x=(x>>>8)^table[(x^b[i])&255];return (x^0xffffffff)>>>0;}
module.exports=crc;
