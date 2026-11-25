'use strict';
const fs=require('fs');
function valid(v){return !!(v&&v.schema===1&&(v.mode==='live'||v.mode==='archive'&&Number.isFinite(v.wall)&&Math.abs(v.wall)<8640000000000000));}
function retained(s,choice){return (s.ranges||[]).some(r=>choice.wall>=r.from&&choice.wall<=r.to&&(!choice.tripId||choice.tripId===r.tripId));}
class PlaybackSession{
 constructor(file,o){o=o||{};this.file=file;this.fs=o.fs||fs;this.now=o.now||Date.now;this.choice={schema:1,mode:'live'};this.saved=null;this.active=false;this.serial=0;this.pending=null;this.restore=true;this.waitingLive=false;this.fallbackAt=null;this.nextAttempt=0;
  try{const st=this.fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>1024)throw Error('Invalid playback preference');const v=JSON.parse(this.fs.readFileSync(file,'utf8'));if(valid(v)){this.choice=v;this.saved=JSON.stringify(v);}}catch(e){}
 }
 open(){this.active=true;this.serial++;this.pending=null;this.restore=true;this.waitingLive=false;this.fallbackAt=null;this.nextAttempt=0;}
 command(c,s){if(!c||['preview','seek','live','pause','stop'].indexOf(c.op)<0)return null;const token=++this.serial;this.pending=token;this.restore=false;this.waitingLive=false;this.fallbackAt=null;this.nextAttempt=0;
  if(c.op==='live')this.choice={schema:1,mode:'live'};
  else{const wall=c.op==='pause'?s&&s.player&&s.player.wall:c.wall;if(Number.isFinite(wall)){const range=(s&&s.ranges||[]).find(r=>wall>=r.from&&wall<=r.to);this.choice={schema:1,mode:'archive',wall,tripId:range&&range.tripId||0};}}
  return token;
 }
 applied(token){if(token===this.pending)this.pending=null;}
 missing(error){if(!/No video at selected time|range was overwritten|Snapshot superseded/.test(String(error&&error.message||error)))return false;if(!this.active)return true;if(this.choice.mode==='archive'){this.choice={schema:1,mode:'live'};this.fallbackAt=null;}this.restore=false;this.waitingLive=true;this.nextAttempt=this.now()+250;return true;}
 observe(s,adjusting){if(!this.active||this.restore||this.pending!==null||adjusting||this.choice.mode!=='archive')return;const p=s.player;if(p&&['playing','paused'].indexOf(p.mode)>=0&&Number.isFinite(p.wall)){const r=(s.ranges||[]).find(r=>p.wall>=r.from&&p.wall<=r.to);this.choice={schema:1,mode:'archive',wall:p.wall,tripId:r&&r.tripId||this.choice.tripId||0};}}
 plan(s,blocked){if(!this.active||blocked||this.pending!==null||this.now()<this.nextAttempt)return null;if(s.archiveChange&&['preparing','allocating','copying'].indexOf(s.archiveChange.state)>=0)return null;
  const mode=s.player&&s.player.mode;if(!this.restore&&!this.waitingLive&&mode!=='stopped')return null;
  if(this.choice.mode==='archive'&&retained(s,this.choice)){if(!this.restore&&mode!=='stopped')return null;this.restore=false;this.nextAttempt=this.now()+2000;return {op:'preview',wall:this.choice.wall};}
  // Missing/overwritten archive positions revert to live intent, not a nearby trip.
  this.choice={schema:1,mode:'live'};
  if(s.liveAvailable===true){this.restore=false;this.waitingLive=false;this.nextAttempt=this.now()+2000;return {op:'live'};}
  this.restore=false;this.waitingLive=true;const ranges=s.ranges||[],last=ranges[ranges.length-1];
  // If the camera sleeps, show the latest retained frame once and await availability.
  if(last&&Number.isFinite(last.to)&&(this.fallbackAt===null||mode==='stopped'&&this.fallbackAt!==last.to)){this.fallbackAt=last.to;this.nextAttempt=this.now()+2000;return {op:'preview',wall:last.to};}return null;
 }
 close(s,adjusting){if(!this.active)return;this.observe(s||{},adjusting);this.active=false;this.serial++;this.pending=null;const text=JSON.stringify(this.choice);if(text===this.saved)return;
  try{const tmp=this.file+'.new';this.fs.writeFileSync(tmp,text+'\n',{mode:0o600});this.fs.renameSync(tmp,this.file);this.saved=text;}catch(e){}
 }
}
module.exports={PlaybackSession,retained,valid};
