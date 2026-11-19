'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),{View}=require('../ui/view');
const from=1700000000000,v=new View();v.update({settings:{archiveSizeGiB:4},ranges:[{from,to:from+180000,tripId:1}],player:{mode:'stopped'},liveAvailable:true});v.cursor=from;v.draw(1600,440);let knob=0,press=0;
function turn(n){knob=(knob+n+65536)%65536;const cmd=v.controller({knob,press});v.draw(1600,440);return cmd;}
function click(){press=1;const cmd=v.controller({knob,press});v.draw(1600,440);press=0;v.controller({knob,press});return cmd;}
function focus(id){const index=v.controls.findIndex(c=>c.id===id);assert(index>=0,id);turn(index-v.focus);assert.equal(v.focusId,id);}
v.controller({knob,press});const order=v.controls.map(c=>c.id);assert.deepStrictEqual(order,['settings','privacy','timeline','back60','back10','back','play','forward','forward10','forward60','live','export']);
turn(3);assert.equal(v.focusId,'back60');turn(-2);assert.equal(v.focusId,'privacy');focus('export');v.status.liveAvailable=false;v.draw(1600,440);assert.equal(v.focusId,'export');assert.equal(v.controls[v.focus].id,'export');
focus('settings');click();assert.equal(v.page,'settings');focus('history');click();assert.equal(v.page,'history');assert.equal(v.focusId,'settings');
focus('export');assert.equal(click().op,'chooseUsb');v.chooseExport(from,[{id:'8:17',label:'USB'}]);v.draw(1600,440);assert.equal(v.focusId,'export-cancel');click();assert.equal(v.page,'history');assert.equal(v.focusId,'export');
v.chooseExport(from,[{id:'8:17',label:'A'},{id:'8:33',label:'B'}]);v.draw(1600,440);focus('history');click();assert.equal(v.page,'history');assert.equal(v.focusId,'export');
focus('settings');click();focus('archive-clear');click();assert.equal(v.focusId,'clear-cancel');click();assert.equal(v.page,'settings');assert.equal(v.focusId,'archive-clear');focus('history');click();
focus('timeline');click();assert.equal(v.adjusting,true);assert.equal(turn(3).op,'preview');assert.equal(v.cursor,from+3000);click();assert.equal(v.adjusting,false);turn(1);assert.equal(v.focusId,'back60');
const c=v.controls.find(c=>c.id==='play');v.touch('up',c.x+c.w/2,c.y+c.h/2);assert.equal(v.focusId,'play');turn(1);assert.equal(v.focusId,'forward');
const before=v.focus;knob=65535;v.ccu={knob,press:0};turn(1);assert.equal(v.focus,(before+1)%v.controls.length);
const result={status:'PASS',checks:['spatial top-to-bottom and left-to-right order','multiple detents preserved','stable control ID when buttons become unavailable','settings returns to calling button','USB and clear confirmation default to Cancel and restore invoking focus','timeline requires explicit editing and only previews','first turn after touch is retained','16-bit knob wrap']};fs.writeFileSync(path.join(__dirname,'IDRIVE-FOCUS-RESULT.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
