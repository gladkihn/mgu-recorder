'use strict';
const fs=require('fs'),crypto=require('crypto'),{readKey}=require('./remote-video-server');
function ensure(file){file=file||'/var/opt/owner-dvr/rse-video.key';if(fs.existsSync(file)){readKey(file);return {created:false};}const tmp=file+'.pair-new',fd=fs.openSync(tmp,'wx',0o600);try{fs.writeSync(fd,crypto.randomBytes(32).toString('hex'));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);return {created:true};}
module.exports={ensure};
