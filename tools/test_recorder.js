'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'../recorder');fs.mkdirSync(path.join(root,'evidence'),{recursive:true});
for(const name of fs.readdirSync(path.join(root,'test')).filter(x=>x.endsWith('.js')).sort()){
 const r=cp.spawnSync(process.execPath,[path.join(root,'test',name)],{cwd:root,encoding:'utf8',timeout:60000});
 process.stdout.write(name+': '+(r.status===0?'PASS':'FAIL')+'\n');if(r.status!==0){process.stderr.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status||1);}
}
