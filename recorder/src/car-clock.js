'use strict';
// BMW's displayed civil time, not UTC, GPS time, or a guessed timezone.
const monotonic=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};
function civil(v){
 if(!v||typeof v!=='object')return null;
 const names=['displayDateYear','displayDateMonth','displayDateDay','displayHour','displayMinute','displaySecond'],a=names.map(n=>v[n]);
 if(!a.every(Number.isInteger)||a[0]<1900||a[0]>9999||a[1]<1||a[1]>12||a[2]<1||a[2]>31||a[3]<0||a[3]>23||a[4]<0||a[4]>59||a[5]<0||a[5]>59)return null;
 if(Number.isInteger(v.statusDisplayClockTimeDate)&&v.statusDisplayClockTimeDate>=13)return null;
 const ms=Date.UTC(a[0],a[1]-1,a[2],a[3],a[4],a[5]),d=new Date(ms);
 if(d.getUTCFullYear()!==a[0]||d.getUTCMonth()!==a[1]-1||d.getUTCDate()!==a[2])return null;
 return ms;
}
class CarClock{
 constructor(o){o=o||{};this.mono=o.mono||monotonic;this.wall=o.wall||Date.now;this.anchor=null;}
 update(v,source){const value=civil(v),at=this.mono();if(value===null){this.anchor=null;return null;}
  // A repeated snapshot must not reset the subsecond phase of a running clock.
  if(!this.anchor||this.anchor.displayMs!==value)this.anchor={displayMs:value,mono:at,systemMs:this.wall(),source};
  this.anchor.seenMono=at;return this.snapshot();
 }
 invalidate(){this.anchor=null;}
 snapshot(){return this.anchor?Object.assign({},this.anchor):null;}
}
function displayed(clock,at){if(!clock||!Number.isFinite(clock.displayMs)||!Number.isFinite(clock.mono)||!Number.isFinite(clock.seenMono)||at-clock.seenMono>120000||at<clock.mono-1000)return null;return clock.displayMs+at-clock.mono;}
module.exports={CarClock,civil,displayed,monotonic};
