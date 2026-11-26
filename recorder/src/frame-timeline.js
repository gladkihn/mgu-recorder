'use strict';
const EventEmitter=require('events');
// Merge capture timestamps, not frame counters. A quiet source keeps its last image.
class FrameTimeline extends EventEmitter {
 constructor(o){super();o=o||{};this.delay=o.reorderMs===undefined?24:o.reorderMs;this.baseDelay=this.delay;this.nvDelay=o.nvReorderMs===undefined?140:o.nvReorderMs;this.coalesce=o.coalesceMs===undefined?20:o.coalesceMs;this.auto=!!o.auto;this.now=o.now||Date.now;this.max=o.maxPending||128;this.pending=[];this.latest={icam:null,nv:null};this.last=-Infinity;this.serial=0;this.enabled=false;}
 configure(enabled){enabled=!!enabled;if(enabled===this.enabled)return;this.flush(Infinity);this.enabled=enabled;this.delay=enabled?Math.max(this.baseDelay,this.nvDelay):this.baseDelay;this.latest={icam:null,nv:null};this.last=-Infinity;this.emit('reset',enabled);}
 push(source,row){if(source!=='icam'&&source!=='nv')throw Error('Unknown video source');if(!row||!Buffer.isBuffer(row.data)||!Number.isFinite(row.mono)||!Number.isFinite(row.wall))throw Error('Invalid capture frame');if(source==='nv'&&!this.enabled)return;if(this.pending.length>=this.max)this.flush(Infinity);if(row.mono<this.last){const shift=this.last-row.mono+0.001;row=Object.assign({},row,{mono:row.mono+shift,wall:row.wall+shift,displayWall:Number.isFinite(row.displayWall)?row.displayWall+shift:null});}this.pending.push({source,row,serial:++this.serial});this.pending.sort((a,b)=>a.row.mono-b.row.mono||a.serial-b.serial);this.arm();}
 arm(){if(!this.auto||this.timer||!this.pending.length)return;const wait=Math.max(0,this.pending[0].row.mono+this.delay-this.now()+1);this.timer=setTimeout(()=>{this.timer=null;try{this.flush(this.now());}catch(e){this.reset(true);this.emit('fault',e);}this.arm();},wait);if(this.timer.unref)this.timer.unref();}
 flush(now){const until=now===Infinity?Infinity:now-this.delay;while(this.pending.length&&this.pending[0].row.mono<=until){let at=this.pending[0].row.mono;const first=this.pending[0].source;let changed=0,anchor=null;let count=0;while(this.pending.length&&(count===0||count===1&&this.pending[0].source!==first&&this.pending[0].row.mono-at<=this.coalesce)){const e=this.pending.shift();this.latest[e.source]=e.row;at=e.row.mono;count++;changed|=e.source==='icam'?1:2;anchor=e.row;}
   at=Math.max(at,this.last+0.001);this.last=at;
   const main=this.latest.icam,nv=this.enabled?this.latest.nv:null,metadata=main||anchor;
   const elapsed=at-metadata.mono;this.emit('frame',Object.assign({},metadata,{mono:at,wall:metadata.wall+elapsed,displayWall:Number.isFinite(metadata.displayWall)?metadata.displayWall+elapsed:null,icam:main,nv,changed,recordable:anchor.recordable,tripId:anchor.tripId||metadata.tripId||0,width:this.enabled?1920:1280,height:480,layout:this.enabled?'nv-left':'icam',nightVision:this.enabled}));
  }}
 reset(keepImages){clearTimeout(this.timer);this.timer=null;this.pending=[];if(!keepImages){this.latest={icam:null,nv:null};this.last=-Infinity;}}
}
module.exports={FrameTimeline};
