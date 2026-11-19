'use strict';
// The native SOME/IP addon runs here; its blocking calls cannot stall video/HDD I/O.
const {Platform}=require('./platform');let platform=null,wanted=false,busy=false,stopping=false,retry=null;
function send(m){if(process.connected)try{process.send(m,()=>{});}catch(e){}}
async function apply(){if(!platform||busy||stopping)return;clearTimeout(retry);busy=true;const on=wanted;try{await platform.request(on);}catch(e){send({type:'error',message:e.message});if(!stopping)retry=setTimeout(apply,1000);}finally{busy=false;if(wanted!==on&&!stopping)setImmediate(apply);}}
async function stop(){if(stopping)return;stopping=true;clearTimeout(retry);const force=setTimeout(()=>process.exit(0),6500);try{while(busy)await new Promise(r=>setTimeout(r,20));if(platform)await platform.stop();}catch(e){}clearTimeout(force);process.exit(0);}
process.on('message',m=>{if(!m)return;if(m.op==='restoreLines'){if(!platform){send({type:'reply',id:m.id,error:'Camera adapter not ready'});return;}platform.lines.restore().then(()=>send({type:'reply',id:m.id,result:true}),e=>send({type:'reply',id:m.id,error:e.message}));}else if(m.op==='stop')stop();else if(m.op==='request'){wanted=!!m.on;apply();}});process.on('disconnect',stop);process.on('SIGTERM',stop);
(async()=>{const p=new Platform();await p.start();if(stopping){await p.stop();return;}platform=p;p.on('state',state=>send({type:'state',state}));send({type:'state',state:p.state});send({type:'ready'});await apply();})().catch(e=>{send({type:'error',message:e.message});process.exit(1);});
