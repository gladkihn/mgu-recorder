'use strict';
// ICAM SWFL 2c16.022_001_001: InitFixedCamera uses cameraPosition 1 for the
// explicit front transition (state 0x59 -> 0x5a). SIDEVIEW uses direction history.
// Only an own INDIRECT request uses this target. OEM DIRECT retains priority.
const REQUEST=Object.freeze({application:'TOPREARVIEW',mode:'FIXED_CAMERA',perspective:1});
function same(a,b){return !!(a&&b&&a.application===b.application&&a.mode===b.mode&&a.perspective===b.perspective);}
function classify(state,xview,proxy){
 const out={ready:false,kind:'waiting',direction:'unknown',title:'Ожидание камеры'};
 if(!same(state,xview)||proxy!=='CAMERA_READY')return out;
 if(state.application==='TOPREARVIEW'){
  // 'parking' is the existing RSE presenter's camera-left crop. Keep it even
  // for explicit front, so the synthetic right pane never reaches the screens.
  out.ready=true;out.kind='parking';out.title='Парковочная камера';
  if(same(state,REQUEST)){out.direction='front';out.title='Передняя камера';}
 }else if(state.application==='SIDEVIEW'&&state.perspective===0){
  if(state.mode==='SIDEVIEW_FRONT'){out.ready=true;out.kind='front';out.direction='front';out.title='Передняя камера';}
  if(state.mode==='SIDEVIEW_REAR'){out.ready=true;out.kind='rear';out.direction='rear';out.title='Задняя камера';}
 }
 return out;
}
module.exports={REQUEST,same,classify};
