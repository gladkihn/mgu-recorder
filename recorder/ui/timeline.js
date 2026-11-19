'use strict';
const COLORS=['#bc603b','#4c83a1','#6b926c','#9273a9','#aa8f45','#4d9290'];
function color(key){let n=0;for(let i=0;i<key.length;i++)n=(n*31+key.charCodeAt(i))>>>0;return COLORS[n%COLORS.length];}
function create(ranges,known){known=known||Object.create(null);const parts=[];let total=0,last=null,legacy=0;for(const r of ranges||[]){if(!Number.isFinite(r.from)||!Number.isFinite(r.to)||r.to<r.from)continue;if(!r.tripId&&(!last||last.tripId||r.from-last.to>300000))legacy++;const key=r.tripId?'trip:'+r.tripId:'legacy:'+legacy;const duration=Math.max(40,r.to-r.from);parts.push({from:r.from,to:r.to,offset:total,duration,key,color:null});total+=duration;last=r;}
 for(let i=0;i+1<parts.length;i++){const a=parts[i],b=parts[i+1];if(a.key.indexOf('legacy:')===0&&b.key.indexOf('trip:')===0&&b.from-a.to<=300000){const old=a.key;for(const p of parts)if(p.key===old)p.key=b.key;}}let previous=null;for(const p of parts){if(!known[p.key]){let c=color(p.key);if(previous&&previous.key!==p.key&&previous.color===c)c=COLORS[(COLORS.indexOf(c)+1)%COLORS.length];known[p.key]=c;}p.color=known[p.key];previous=p;}
 function position(wall){for(const p of parts){if(wall<p.from)return p.offset;if(wall<=p.to)return p.offset+(p.to===p.from?0:(wall-p.from)/(p.to-p.from)*p.duration);}return total;}
 function wall(offset){offset=Math.max(0,Math.min(total,offset));for(let i=0;i<parts.length;i++){const p=parts[i];if(offset<p.offset+p.duration||i===parts.length-1)return p.from+(p.to-p.from)*Math.max(0,Math.min(1,(offset-p.offset)/p.duration));}return null;}
 function step(at,delta){return wall(position(at)+delta);}
 function minute(at){return clip(at)>=60000;}
 function clip(at){if(!Number.isFinite(at))return 0;let end=at,key=null;for(const p of parts){if(key===null){if(p.to<at)continue;if(at<p.from)return 0;key=p.key;}else if(p.key!==key)break;end=Math.max(end,p.to);if(end-at>=60000)return 60000;}return key!==null?Math.min(60000,Math.max(40,end-at+40)):0;}
 return {parts,total,position,wall,step,minute,clip};
}
module.exports={create,COLORS};
