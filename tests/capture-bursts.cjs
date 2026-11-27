'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{createRequire}=require('module'),{FrameTimeline}=require('../recorder/src/frame-timeline');
const file=path.resolve(__dirname,'../recorder/src/service.js'),local=createRequire(file),clock=local('./car-clock');let now=0;
const mod={exports:{}};const req=n=>n==='./car-clock'?Object.assign({},clock,{monotonic:()=>now}):local(n);req.main={};
const proc=Object.assign(Object.create(process),{hrtime:()=>[Math.floor(now/1000),(now%1000)*1e6]});
vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:mod,require:req,__dirname:path.dirname(file),process:proc,Buffer,console,setTimeout,clearTimeout,setInterval,clearInterval});
function run(batch){const r=new mod.exports.Recorder({settingsFile:path.join(__dirname,'absent-settings.json')}),out=[],seen={icam:new Set(),nv:new Set()};r.platformState={scene:{id:1},sceneAt:Date.now(),speedAt:Date.now()};r.want=true;r.trips={current:()=>1};r.media={liveMode:true};r.hub={frame(){}};r.timeline=new FrameTimeline({nvReorderMs:80,coalesceMs:35});r.timeline.configure(true);r.timeline.on('frame',v=>{out.push(v);for(const k of ['icam','nv'])if(v[k])seen[k].add(v[k].data);});
 const source={icam:[],nv:[]};for(let i=0;i<1500;i++)source.icam.push({mono:i*40,data:Buffer.from('i'+i),raw:Buffer.alloc(8)});for(let i=0;i<1798;i++)source.nv.push({mono:i*1000/29.97,data:Buffer.from('n'+i)});
 let a=0,b=0;for(now=batch;now<=60300;now+=batch){r.platformState.sceneAt=Date.now();while(b<source.nv.length&&source.nv[b].mono<now)r.nvFrame(source.nv[b++]);while(a<source.icam.length&&source.icam[a].mono<now)r.frame(source.icam[a++]);r.timeline.flush(now);}r.timeline.flush(Infinity);
 assert.equal(seen.icam.size,source.icam.length);assert.equal(seen.nv.size,source.nv.length);assert(out.length<1860,JSON.stringify({batch,frames:out.length}));assert(out[out.length-1].mono<60100);return {batch,composites:out.length};}
console.log('PASS libuv delivery bursts keep every source frame at ~30 fps instead of manufacturing extra composites',JSON.stringify([40,80,120,200].map(run)));
