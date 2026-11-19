'use strict';
const net=require('net');
class Api{constructor(socket){this.socket=socket||'/run/owner-dvr/control.sock';this.next=1;}
 call(command){return new Promise((resolve,reject)=>{const id=this.next++,s=net.connect(this.socket);let b='',done=false;function finish(e,v){if(done)return;done=true;s.destroy();e?reject(e):resolve(v);}s.on('connect',()=>s.write(JSON.stringify(Object.assign({id},command))+'\n'));s.on('error',e=>finish(e));s.setTimeout(10000,()=>finish(Error('Регистратор не отвечает')));s.on('data',v=>{b+=v;if(b.length>1048576)return finish(Error('Invalid recorder response'));const i=b.indexOf('\n');if(i<0)return;try{const v=JSON.parse(b.slice(0,i));if(v.id!==id)throw Error('Recorder response ID');finish(v.error?Error(v.error):null,v.result);}catch(e){finish(e);}});s.on('end',()=>{if(!done)finish(Error('Регистратор отключён'));});});}}
module.exports={Api};
