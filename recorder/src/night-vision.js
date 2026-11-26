'use strict';
const EventEmitter=require('events'),{observe}=require('./observed-fields');
const validCamera=v=>v===1||v===2||v==='NIGHT_MINUS_VISION_MINUS_KAMERA_AUS'||v==='NIGHT_MINUS_VISION_MINUS_KAMERA_EIN';
const displayOff=v=>v===1||v==='NIGHT_MINUS_VISION_MINUS_BILD_AUS';
const displayOn=v=>v===2||v==='NIGHT_MINUS_VISION_MINUS_BILD_EIN';
class NightVision extends EventEmitter{
 constructor(build){super();this.build=build;this.state={present:false,available:false,owned:false};this.wanted=false;this.stopped=false;this.chain=Promise.resolve();}
 changed(){let value=null;try{value=this.fields.statusNightVision.read();}catch(e){}const camera=value&&value.statusCameraNightVision;this.state.present=validCamera(camera);this.state.available=this.state.present;this.state.camera=camera===undefined?null:camera;this.display=value&&value.requestDisplayNightVision;this.state.oemDisplay=displayOn(this.display);this.emit('state',Object.assign({},this.state));if(this.wanted||this.state.owned)this.request(this.wanted).catch(()=>{});}
 async start(){try{this.fasus=await this.build('de.bmw.infotainment.fasus.FASuS',['statusNightVision'],[]);if(this.stopped)return;this.fields=await observe(this.fasus,['statusNightVision'],()=>{if(this.fields)this.changed();});this.changed();}catch(e){this.state={present:false,available:false,owned:false};this.emit('state',this.state);}return this;}
 request(on){this.wanted=!!on;const p=this.chain.then(()=>this.apply());this.chain=p.catch(()=>{});return p;}
 async apply(){const on=this.wanted&&this.state.present&&!this.stopped;
  if(on&&!this.video){try{this.video=await this.build('de.bmw.infotainment.video.nivivideo.NiViVideo',['niviVideoState'],['startVideo','stopVideo']);this.videoFields=await observe(this.video,['niviVideoState'],()=>{if(this.videoFields){try{this.state.video=this.videoFields.niviVideoState.read();}catch(e){this.state.video=null;}this.emit('state',Object.assign({},this.state));if(this.wanted&&(this.state.video===0||this.state.video==='IDLE')){clearTimeout(this.retry);this.retry=setTimeout(()=>this.request(this.wanted).catch(()=>{}),250);}}});try{this.state.video=this.videoFields.niviVideoState.read();}catch(e){}}catch(e){this.state.error='D_NV_SERVICE';this.emit('state',this.state);return;}}
  if(on&&!displayOn(this.display)&&(!this.state.owned||this.state.video===0||this.state.video==='IDLE')){try{await this.video.callMethod('startVideo',{},700);this.state.owned=true;this.state.releasePending=false;delete this.state.error;}catch(e){this.state.error='D_NV_START';}}
  if(!on&&this.state.owned){if(displayOff(this.display)){try{await this.video.callMethod('stopVideo',{},700);this.state.owned=false;this.state.releasePending=false;}catch(e){this.state.releasePending=true;}}else this.state.releasePending=true;}
  this.emit('state',Object.assign({},this.state));
 }
 async stop(){this.stopped=true;this.wanted=false;clearTimeout(this.retry);await this.request(false).catch(()=>{});}
}
module.exports={NightVision,validCamera,displayOff,displayOn};
