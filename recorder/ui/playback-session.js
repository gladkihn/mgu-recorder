'use strict';
const fs=require('fs'),timeline=require('./timeline');
function point(v){return v&&Number.isFinite(v.wall)&&Math.abs(v.wall)<8640000000000000?{wall:v.wall,tripId:Number.isInteger(v.tripId)?v.tripId:0}:null;}
function valid(v){return !!(v&&v.schema===1&&(v.mode==='live'||v.mode==='archive'&&point(v)));}
function retained(s,choice){return !!choice&&(s.ranges||[]).some(r=>choice.wall>=r.from&&choice.wall<=r.to&&(!choice.tripId||choice.tripId===r.tripId));}
function lastMinute(s){const track=timeline.create(s.ranges||[]),parts=track.parts;if(!parts.length)return null;let i=parts.length-1;while(i>0&&parts[i-1].key===parts[parts.length-1].key)i--;const wall=track.wall(Math.max(parts[i].offset,track.total-60000)),r=(s.ranges||[]).find(r=>wall>=r.from&&wall<=r.to);return {wall,tripId:r&&r.tripId||0};}
class PlaybackSession{
 constructor(file,o){o=o||{};this.file=file;this.fs=o.fs||fs;this.now=o.now||Date.now;this.choice={schema:1,mode:'live'};this.lastArchive=null;this.saved=null;this.active=false;this.serial=0;this.pending=null;this.restore=true;this.waitingLive=false;this.fallbackAt=null;this.fallbackActive=false;this.nextAttempt=0;this.liveRetryAt=0;
  try{const st=this.fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>1024)throw Error('Invalid playback preference');const v=JSON.parse(this.fs.readFileSync(file,'utf8'));if(valid(v)){this.choice=v;this.lastArchive=point(v.lastArchive)||(v.mode==='archive'?point(v):null);this.saved=JSON.stringify(v);}}catch(e){}
 }
 open(){this.active=true;this.serial++;this.pending=null;this.restore=true;this.waitingLive=false;this.fallbackAt=null;this.fallbackActive=false;this.nextAttempt=0;this.liveRetryAt=0;}
 command(c,s){if(!c||['preview','seek','live','pause','stop'].indexOf(c.op)<0)return null;const token=++this.serial;this.pending=token;this.restore=false;this.waitingLive=false;this.fallbackAt=null;this.fallbackActive=false;this.nextAttempt=0;this.liveRetryAt=0;
  if(c.op==='live')this.choice={schema:1,mode:'live'};
  else{const wall=c.op==='pause'?s&&s.player&&s.player.wall:c.wall;if(Number.isFinite(wall)){const r=(s&&s.ranges||[]).find(r=>wall>=r.from&&wall<=r.to);this.lastArchive={wall,tripId:r&&r.tripId||0};this.choice=Object.assign({schema:1,mode:'archive'},this.lastArchive);}}
  return token;
 }
 applied(token){if(token===this.pending)this.pending=null;}
 missing(error){const text=String(error&&error.message||error);if(!/No video at selected time|range was overwritten|Snapshot superseded|Live camera unavailable/.test(text))return false;if(!this.active)return true;
  if(this.choice.mode==='archive'){this.choice={schema:1,mode:'live'};this.fallbackAt=null;}
  if(/Live camera unavailable/.test(text))this.liveRetryAt=this.now()+2000;else this.fallbackActive=false;
  this.restore=false;this.waitingLive=true;this.nextAttempt=this.now()+250;return true;
 }
 observe(s,adjusting){if(!this.active||this.restore||this.pending!==null||adjusting||this.choice.mode!=='archive'&&!this.fallbackActive)return;const p=s.player;if(p&&['playing','paused'].indexOf(p.mode)>=0&&Number.isFinite(p.wall)){const r=(s.ranges||[]).find(r=>p.wall>=r.from&&p.wall<=r.to);this.lastArchive={wall:p.wall,tripId:r&&r.tripId||this.lastArchive&&this.lastArchive.tripId||0};if(this.choice.mode==='archive')this.choice=Object.assign({schema:1,mode:'archive'},this.lastArchive);}}
 plan(s,blocked){if(!this.active||blocked||this.pending!==null||this.now()<this.nextAttempt)return null;if(s.archiveChange&&['preparing','allocating','copying'].indexOf(s.archiveChange.state)>=0)return null;
  const mode=s.player&&s.player.mode,live=s.liveAvailable===true&&s.ignition!==false&&this.now()>=this.liveRetryAt,lostLive=this.choice.mode==='live'&&!live&&mode==='live';
  if(!this.restore&&!this.waitingLive&&mode!=='stopped'&&!lostLive)return null;
  if(this.choice.mode==='archive'&&retained(s,this.choice)){if(!this.restore&&mode!=='stopped')return null;this.restore=false;this.nextAttempt=this.now()+2000;return {op:'preview',wall:this.choice.wall};}
  this.choice={schema:1,mode:'live'};
  if(live){this.restore=false;this.waitingLive=false;this.fallbackActive=false;this.nextAttempt=this.now()+2000;return {op:'live'};}
  this.restore=false;this.waitingLive=true;
  if(this.fallbackActive&&['playing','paused','loading'].indexOf(mode)>=0)return null;
  const from=retained(s,this.lastArchive)?this.lastArchive:lastMinute(s);
  if(from&&this.fallbackAt!==from.wall){this.lastArchive=from;this.fallbackAt=from.wall;this.fallbackActive=true;this.nextAttempt=this.now()+2000;return {op:'seek',wall:from.wall};}return null;
 }
 close(s,adjusting){if(!this.active)return;this.observe(s||{},adjusting);this.active=false;this.serial++;this.pending=null;const value=Object.assign({},this.choice);if(this.lastArchive)value.lastArchive=this.lastArchive;else delete value.lastArchive;const text=JSON.stringify(value);if(text===this.saved)return;
  try{const tmp=this.file+'.new';this.fs.writeFileSync(tmp,text+'\n',{mode:0o600});this.fs.renameSync(tmp,this.file);this.saved=text;}catch(e){}
 }
}
module.exports={PlaybackSession,retained,valid,lastMinute};
