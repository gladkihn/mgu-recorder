'use strict';
// Release the unified endpoint before enabling the preserved legacy listener.
const net=require('net'),{change}=require('./camera-migration');
let b='',done=false;const s=net.connect('/run/owner-dvr/control.sock',()=>s.write('{"id":1,"op":"suspendRemoteVideo"}\n'));s.setTimeout(3000,()=>fail(Error('Unified video shutdown timeout')));s.on('error',fail);s.on('data',v=>{b+=v;if(b.length>8192)return fail(Error('Response bound'));if(b.indexOf('\n')<0)return;try{const q=JSON.parse(b.split('\n')[0]);if(q.result!==true)throw Error(q.error||'Unified video shutdown refused');done=true;s.destroy();console.log(JSON.stringify(change('rollback')));}catch(e){fail(e);}});
function fail(e){if(done)return;done=true;s.destroy();if(e.code==='ENOENT'||e.code==='ECONNREFUSED'){try{console.log(JSON.stringify(change('rollback')));return;}catch(x){e=x;}}console.error(e.message);process.exitCode=1;}
