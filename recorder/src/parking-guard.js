'use strict';
const value=(v,names)=>typeof v==='string'?names.indexOf(v):Number.isInteger(v)&&v>=0&&v<names.length?v:-1;
const mono=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};
class ParkingGuard{
 constructor(o){o=o||{};this.now=o.now||mono;this.quietMs=o.quietMs===undefined?750:o.quietMs;this.available=false;this.known=false;this.active=null;this.until=0;this.reason='WAITING_FOR_PARKMENU';}
 unavailable(){this.available=false;this.known=false;this.active=null;this.until=0;this.reason='PARKMENU_UNAVAILABLE';}
 surface(active){this.surfaceActive=active;if(typeof active!=='boolean'){this.unavailable();this.reason='CAMERA_SURFACE_UNAVAILABLE';return;}this.update({hmiRequest:active?2:0,hmiVisibilityRequest:active?1:2,parkmenuRequest:active?1:2});this.reason=active?'OEM_CAMERA_SURFACE_VISIBLE':'OEM_CAMERA_SURFACE_HIDDEN';}
 update(v){const h=value(v&&v.hmiRequest,['HMI_NOT_REQUESTED','EARLY_HMI_REQUESTED','HMI_REQUESTED']),fade=value(v&&v.hmiVisibilityRequest,['NO_CHANGE','FADE_IN','FADE_OUT']),menu=value(v&&v.parkmenuRequest,['PARKMENU_NOT_REQUESTED','PARKMENU_VISIBILITY_REQUESTED','PARKMENU_CLEANUP_REQUESTED']);
  if(h<0||fade<0||menu<0){this.unavailable();this.reason='INVALID_PARKMENU_STATE';return;}
  const previous=this.active,known=this.known;this.available=true;this.known=true;
  if(this.surfaceActive===true)this.active=true;
  else if(fade===2||menu===2)this.active=false;
  else if(fade===1||menu===1)this.active=true;
  else if(h===0&&menu===0)this.active=false;
  else{this.known=false;this.active=null;this.until=0;this.reason='WAITING_FOR_VISIBILITY_REQUEST';return;}
  if(this.active){this.until=0;this.reason='OEM_PARKMENU_REQUESTED';}
  else{if(!known||previous!==false)this.until=this.now()+this.quietMs;this.reason='OEM_PARKMENU_CLOSED';}
 }
 snapshot(){const waitMs=this.known&&!this.active?Math.max(0,this.until-this.now()):0;return {available:this.available,known:this.known,active:this.active,allowed:this.available&&this.known&&this.active===false&&waitMs===0,waitMs,reason:this.reason};}
}
module.exports={ParkingGuard};
