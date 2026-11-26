'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),EventEmitter=require('events');
const root=path.resolve(__dirname,'../recorder'),src=n=>require(path.join(root,'src',n));
const {CarClock,civil,displayed}=src('car-clock'),format=src('format'),{Ring}=src('ring'),{Platform}=src('platform'),{View}=require(path.join(root,'ui/view'));
const sample=(h,m,s,y=2026,month=11,day=25,status=0)=>({displayDateYear:y,displayDateMonth:month,displayDateDay:day,displayHour:h,displayMinute:m,displaySecond:s,statusDisplayClockTimeDate:status});
const checks=[];
(async()=>{
 let mono=100000,wall=Date.UTC(2026,10,25,11,32,0);const clock=new CarClock({mono:()=>mono,wall:()=>wall});
 for(const [name,h,m,s] of [['automatic UTC+5',16,32,0],['manual without timezone',7,19,37],['manual with timezone',3,4,11]]){
  clock.update(sample(h,m,s),name);assert.equal(format.stamp(displayed(clock.snapshot(),mono),0),`2026-11-25 ${('0'+h).slice(-2)}:${('0'+m).slice(-2)}:${('0'+s).slice(-2)}`);
  mono+=1200;assert.equal(displayed(clock.snapshot(),mono),civil(sample(h,m,s))+1200);
 }
 checks.push('Automatic time and both manual modes use the displayed value, including a non-timezone seconds adjustment');
 clock.update(sample(23,59,59,2024,2,29),'Kombi');mono+=2000;assert.equal(format.stamp(displayed(clock.snapshot(),mono),0),'2024-03-01 00:00:01');
 assert.equal(civil(sample(1,2,3,2025,2,29)),null);assert.equal(civil(sample(1,2,255)),null);assert.equal(civil(sample(1,2,3,2026,11,25,15)),null);
 clock.update(sample(1,2,3),'Kombi');mono+=400;const before=displayed(clock.snapshot(),mono);clock.update(sample(1,2,3),'Kombi');assert.equal(displayed(clock.snapshot(),mono),before);
 mono+=120001;assert.equal(displayed(clock.snapshot(),mono),null);clock.invalidate();assert.equal(clock.snapshot(),null);
 checks.push('Midnight, leap date, invalid/unavailable clock, stale notifications and repeated snapshots');
 // Self-contained protocol fixture; no vehicle dump or BMW SDK is required.
 const clockType={type:'struct',members:Object.keys(sample(0,0,0)).map(name=>({name,dataRef:name==='displayDateYear'?'UInt16':'UInt8'}))};
 const field=(get)=>Object.assign({dataRef:'FixtureClock',notifier:{id:0x8001,eventgroups:[1]}},get?{getter:{id:30}}:{});
 const iface=(name,fields)=>({name,serviceId:1234,version:{major:1,minor:0},fields,methods:{},events:{}});
 const configuration={datatypes:{FixtureClock:clockType},instanceIDs:{},interfaces:{'de.bmw.infotainment.KombiIF':iface('de.bmw.infotainment.KombiIF',{statusShowTimeDate:field(true)}),'de.bmw.infotainment.DisplayStatus':iface('de.bmw.infotainment.DisplayStatus',{TimeDate:field(false)})}};
 const proxies=[],requests=[];
 const native={buildProxy(c){const p={c,init:async()=>{},waitUntilAvailable:async()=>{},shutdown:async()=>{},subscribe(x){this.notify=x.onReceive;},subscribeToAvailability(fn){this.available=fn;fn(true);},getValue:async name=>{requests.push(name);return sample(16,32,0);}};proxies.push(p);return p;}};
 const lines=new EventEmitter();const platform=new Platform({native,catalog:configuration,lines});await platform.watchClock();
 await new Promise(r=>setImmediate(r));assert.equal(requests.length,1);assert.equal(proxies.length,1);assert.deepEqual(Object.keys(proxies[0].c.fields),['statusShowTimeDate']);assert.equal(proxies[0].c.fields.statusShowTimeDate.getter.id,30);assert.equal(proxies[0].c.fields.statusShowTimeDate.setter,undefined);assert.deepEqual(proxies[0].c.methods,{});
 for(let i=0;i<1000;i++)proxies[0].notify(sample(7,19,i%60));assert.equal(requests.length,1);assert.equal(platform.state.clock.displayMs,civil(sample(7,19,39)));
 proxies[0].available(false);assert.equal(platform.state.clock,null);platform.stopped=true;await Promise.all(proxies.map(p=>p.shutdown()));
 checks.push('Fixture catalogue resolves Kombi getter/notifier; one initial read, 1,000 notifications cause zero extra requests and no setters');
 const fallbackCatalogue=JSON.parse(JSON.stringify(configuration));delete fallbackCatalogue.interfaces['de.bmw.infotainment.KombiIF'];const fallback=new Platform({native,catalog:fallbackCatalogue,lines:new EventEmitter()});await fallback.watchClock();const fp=proxies[proxies.length-1];assert.deepEqual(Object.keys(fp.c.fields),['TimeDate']);assert.equal(requests.length,1);fp.notify(sample(16,33,0));assert(fallback.state.clock);fallback.stopped=true;
 checks.push('Notification-only DisplayStatus fallback makes no getter requests');
 const dir=fs.mkdtempSync(path.join(__dirname,'ring-')),o={cap:262144,slotSize:16384,metaBytes:32768,bankSize:16384},base=Date.UTC(2026,10,25,11,32),data=Buffer.from([0,0,0,1,0x65,1,2,3]);let ring=await new Ring(dir,o).init();
 const rows=[{wall:base,mono:1000,offsetMinutes:180},{wall:base+40,mono:1040,displayWall:base+40+5*3600000},{wall:base+80,mono:1080,displayWall:base+80-7*3600000+37000},{wall:base+120,mono:1120,displayWall:null}];
 for(const row of rows)await ring.append(Object.assign({data,speedRaw:0,source:1,tripId:7},row));await ring.shutdown();ring=await new Ring(dir,o).init();const saved=await ring.after(0);assert.equal(saved.length,4);assert.equal(saved[0].offsetMinutes,180);for(let i=1;i<4;i++)assert.equal(saved[i].displayWall,rows[i].displayWall);assert.equal(saved[2].wall,base+80);assert(saved.every(r=>r.data.equals(data)));assert.equal(ring.ranges().length,4);
 assert.equal(format.rowStamp(saved[1]),'2026-11-25 16:32:00');assert.equal(format.rowStamp(saved[2]),'2026-11-25 04:32:37');assert.equal(format.rowStamp(saved[3]),'Время автомобиля недоступно');
 const overlay=format.overlay(saved.slice(1,3),true,1);assert(overlay.includes('16:32:00'));assert(overlay.includes('04:32:37'));assert(!overlay.includes('11:32:00'));
 const v=new View();v.status={ranges:ring.ranges(),player:{}};assert.equal(v.time(base+40),'16:32:00');assert.equal(v.time(base+80),'04:32:37');assert.equal(v.time(base+120),'—');v.status.player={wall:base+40,displayWall:base+40+5*3600000};assert.equal(v.time(base+40),'16:32:00');
 checks.push('Existing archive format still readable; displayed time survives reopen, manual correction and missing clock; UI and export agree');
 const index=ring.slots.findIndex(s=>s&&s.displayOffsetMs===5*3600000);const bytes=await require(path.join(root,'src/io')).read(ring.fd,ring.slotSize,index*ring.slotSize);bytes[64+64+data.length]^=1;fs.writeSync(ring.fd,bytes,0,bytes.length,index*ring.slotSize);assert.equal((await ring.readSlot(index)).length,0);await ring.shutdown();
 checks.push('Displayed-time extension has its own CRC; corrupt time does not produce a false timestamp');
 const minuteDir=fs.mkdtempSync(path.join(__dirname,'minute-')),minute=await new Ring(minuteDir,o).init();
 for(let i=0;i<1501;i++){if(i===200)continue;await minute.append({data,wall:base+i*40,mono:100000+i*40,displayWall:base+i*40+5*3600000+(i>=750?37000:0),speedRaw:0,source:1,tripId:9});}
 const clip=await minute.exportSnapshot(base,60000);assert.equal(clip.durationMs,60000);assert.equal(clip.rows.length,1499);assert.equal(clip.rows[0].displayWall,base+5*3600000);assert.equal(clip.rows[clip.rows.length-1].displayWall,base+59960+5*3600000+37000);await minute.shutdown();
 checks.push('A dropped frame and a manual clock correction do not shorten the 60-second export or reorder archive positions');
 const {Recorder}=src('service');const recorder=new Recorder({settingsFile:path.join(dir,'settings-missing.json')});recorder.platformState={scene:{id:1},sceneAt:Date.now(),speedAt:Date.now(),speedRaw:0,clock:{displayMs:base+5*3600000,mono:5000,seenMono:5000}};
 // Use the actual frame's monotonic domain, as supplied by the native observer.
 const at=src('car-clock').monotonic();recorder.platformState.clock.mono=recorder.platformState.clock.seenMono=at;recorder.media={feedLive:r=>{recorder.testRow=r;}};recorder.hub={frame:()=>{}};recorder.media.liveMode=true;recorder.timeline=new (src('frame-timeline').FrameTimeline)();recorder.timeline.on('frame',r=>recorder.media.feedLive(r));recorder.want=false;recorder.frame({mono:at,data,raw:data});recorder.timeline.flush(Infinity);assert.equal(recorder.testRow.displayWall,base+5*3600000);
 checks.push('Capture stores BMW civil time separately from the archive lookup epoch');
 const report={status:'PASS',checks,carAccessed:false};fs.writeFileSync(path.join(__dirname,'RESULT.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
