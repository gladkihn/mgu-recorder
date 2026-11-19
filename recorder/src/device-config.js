'use strict';
const fs=require('fs'),path=require('path');
const FILE='/var/opt/owner-dvr/device.json';
function valid(n){return Number.isInteger(n)&&n>=-840&&n<=840;}
function offsetMinutes(file){try{const v=JSON.parse(fs.readFileSync(file||FILE));return valid(v.offsetMinutes)?v.offsetMinutes:undefined;}catch(e){return undefined;}}
function preserveLegacyOffset(script,file){file=file||FILE;if(fs.existsSync(file))return false;const m=/offsetMinutes:(-?\d+)\}/.exec(fs.readFileSync(script,'utf8'));if(!m||!valid(Number(m[1])))return false;const tmp=file+'.migrate',fd=fs.openSync(tmp,'wx',0o600);try{fs.writeSync(fd,JSON.stringify({offsetMinutes:Number(m[1]),source:'preserved local recorder configuration'}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);return true;}
module.exports={offsetMinutes,preserveLegacyOffset};
