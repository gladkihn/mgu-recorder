'use strict';
const fs=require('fs'),path=require('path'),policy=require('./policy');
function load(file){try{return policy.settings(JSON.parse(fs.readFileSync(file,'utf8')));}catch(e){if(e.code==='ENOENT')return policy.defaults();throw e;}}
async function save(file,v){v=policy.settings(v);const temp=file+'.new',fd=fs.openSync(temp,'w',0o600);try{fs.writeSync(fd,Buffer.from(JSON.stringify(v)+'\n'));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);if(process.platform!=='win32'){const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}return v;}
module.exports={load,save};
