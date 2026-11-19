'use strict';
function stamp(wall,offset){const d=new Date(wall+(offset||0)*60000);return d.toISOString().slice(0,19).replace('T',' ');}
function kmh(raw){return raw===null?'—':String(Math.round(raw/64));}
function assTime(seconds){const cs=Math.max(0,Math.round(seconds*100));return Math.floor(cs/360000)+':'+('0'+Math.floor(cs/6000)%60).slice(-2)+':'+('0'+Math.floor(cs/100)%60).slice(-2)+'.'+('0'+cs%100).slice(-2);}
function overlay(rows,withSpeed,duration){const first=rows[0].mono,lines=['[Script Info]','ScriptType: v4.00+','PlayResX: 1280','PlayResY: 480','[V4+ Styles]','Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding','Style: Stamp,DejaVu Sans,24,&H00FFFFFF,&H00FFFFFF,&H00101010,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,20,20,18,1','[Events]','Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text'];let previous=null;
 for(let i=0;i<rows.length;i++){const r=rows[i],from=Math.max(0,(r.mono-first)/1000),to=Math.min(duration,i+1<rows.length?(rows[i+1].mono-first)/1000:duration);const text=stamp(r.wall,r.offsetMinutes)+(withSpeed?'   '+kmh(r.speedRaw)+' км/ч':'');if(to<=from)continue;if(previous&&previous.text===text&&from-previous.to<0.15){previous.to=to;}else{if(previous)lines.push('Dialogue: 0,'+assTime(previous.from)+','+assTime(previous.to)+',Stamp,,0,0,0,,'+previous.text);previous={from,to,text};}}
 if(previous)lines.push('Dialogue: 0,'+assTime(previous.from)+','+assTime(previous.to)+',Stamp,,0,0,0,,'+previous.text);return lines.join('\n')+'\n';}
function coverage(rows,from,duration){if(!rows.length)throw Error('No video at selected time');if(rows[0].wall-from>250||from+duration-rows[rows.length-1].wall>250)throw Error('The complete selected minute is not available');for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(b.mono<=a.mono||b.mono-a.mono>1000||Math.abs((b.wall-a.wall)-(b.mono-a.mono))>1000)throw Error('Selected interval contains a video or clock discontinuity');}return true;}
// Gaps preserve elapsed time. Only an actual trip boundary or EOF shortens a clip.
class Clip{
 constructor(from,limit){this.from=from;this.limit=limit===undefined?60000:limit;this.rows=[];this.previous=null;this.elapsed=0;this.done=false;this.full=false;}
 add(r){if(this.done)return false;if(!this.previous){if(r.wall<this.from)return true;if(r.wall-this.from>1000)throw Error('No video at selected time');this.trip=r.tripId||0;this.base=r.mono;}else{if((r.tripId||0)!==this.trip){this.done=true;return false;}const mono=r.mono-this.previous.mono,wall=r.wall-this.previous.wall;this.elapsed+=mono>0?mono:wall>0?wall:40;if(this.elapsed>=this.limit){this.done=this.full=true;return false;}}
  this.rows.push(Object.assign({},r,{mono:this.base+this.elapsed}));this.previous=r;if(this.elapsed+40>=this.limit)this.done=this.full=true;return !this.done;
 }
 finish(){if(!this.rows.length)throw Error('No video at selected time');return {rows:this.rows,durationMs:this.full?this.limit:Math.min(this.limit,Math.max(40,this.elapsed+40))};}
}
function clip(rows,from,limit){const c=new Clip(from,limit);for(const r of rows)if(!c.add(r))break;return c.finish();}
module.exports={stamp,kmh,overlay,coverage,clip,Clip};
