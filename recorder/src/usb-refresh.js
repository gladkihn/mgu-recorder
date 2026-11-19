'use strict';
// A completed export is closed and synced before this isolated worker starts.
const fs=require('fs'),path=require('path'),cp=require('child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function identity(at,f){return ['devnum','idVendor','idProduct'].map(n=>f.readFileSync(path.dirname(at)+'/'+n,'utf8').trim()).join(':');}
function profile(d,f){f=f||fs;let at=f.realpathSync('/sys/dev/block/'+d.id);for(let i=0;i<12&&!f.existsSync(at+'/bInterfaceClass');i++)at=path.dirname(at);if(f.readFileSync(at+'/bInterfaceClass','utf8').trim()!=='08')throw Error('USB is not Mass Storage');const driver=f.realpathSync(at+'/driver');if(driver!=='/sys/bus/usb/drivers/usb-storage'&&driver!=='/sys/bus/usb/drivers/uas')throw Error('Unsupported USB driver');
 const blocks=f.readdirSync('/sys/class/block').filter(n=>{try{return f.realpathSync('/sys/class/block/'+n).indexOf(at+'/')===0;}catch(e){return false;}}),partitions=blocks.filter(n=>f.existsSync('/sys/class/block/'+n+'/partition')),disks=blocks.filter(n=>partitions.indexOf(n)<0);if(disks.length!==1||partitions.length>1)throw Error('USB has multiple partitions or LUNs');const numbers=blocks.map(n=>f.readFileSync('/sys/class/block/'+n+'/dev','utf8').trim());const mounts=f.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n').map(l=>l.split(' '));if(mounts.some(a=>numbers.indexOf(a[2])>=0&&a[2]!==d.id))throw Error('Another USB filesystem is mounted');return {at,driver,id:path.basename(at),numbers,identity:identity(at,f)};
}
function bus(d,operation){const object='/org/freedesktop/UDisks2/block_devices/'+path.basename(d.source).replace(/[^a-zA-Z0-9]/g,c=>'_'+c.charCodeAt(0).toString(16));const q=cp.spawnSync('/usr/bin/busctl',['--system','--timeout=5','call','org.freedesktop.UDisks2',object,'org.freedesktop.UDisks2.Filesystem',operation,'a{sv}','1','auth.no_user_interaction','b','true'],{encoding:'utf8',timeout:6500});if(q.error||q.status!==0)throw Error((q.stderr||q.error&&q.error.message||'USB '+operation+' failed').trim());}
async function run(request,o){o=o||{};const f=o.fs||fs,U=o.usb||require('./usb'),wait=o.delay||delay,call=o.bus||bus;let d=U.selected(request.id);if(d.source!==request.source||d.path!==request.path)throw Error('USB device changed');if(!/^DVR_[0-9_]+\d+s_[a-f0-9]{6}\.mp4$/.test(request.file))throw Error('Invalid export filename');const saved=f.lstatSync(path.join(d.path,request.file));if(!saved.isFile()||saved.ino!==request.inode)throw Error('Export file changed');const p=profile(d,f);
 // Unmount has no force option: a native player or another writer may veto it.
 try{call(d,'Unmount');}catch(e){return {state:'busy',error:e.message};}
 let unbound=false;
 try{if(U.discover().some(x=>p.numbers.indexOf(x.id)>=0))throw Error('USB still mounted');if(identity(p.at,f)!==p.identity||f.realpathSync(p.at+'/driver')!==p.driver)throw Error('USB interface changed');f.writeFileSync(p.driver+'/unbind',p.id);unbound=true;await wait(900);}
 finally{if(unbound)f.writeFileSync(p.driver+'/bind',p.id);else if(!U.discover().some(x=>x.id===d.id)){try{call(d,'Mount');}catch(e){}}}
 for(let i=0;i<40;i++){const after=U.discover().find(x=>{try{return f.realpathSync('/sys/dev/block/'+x.id).indexOf(p.at+'/')===0;}catch(e){return false;}});if(after){if(d.readOnly&&!after.readOnly)U.remount(after,true);return {state:'refreshed',device:after.id};}await wait(250);}
 throw Error('USB did not remount after refresh');
}
if(require.main===module){let cancelled=false;process.on('SIGTERM',()=>{cancelled=true;});process.stdout.on('error',()=>{});run(JSON.parse(process.argv[2])).then(result=>{process.stdout.write(JSON.stringify(result)+'\n');if(cancelled)process.exitCode=1;},e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});}
module.exports={profile,run};
