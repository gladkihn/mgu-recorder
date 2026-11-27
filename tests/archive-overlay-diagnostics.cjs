'use strict';
const assert=require('assert'),d=require('../recorder/ui/diagnostics');
const guidelines={trajectories:{mode:'unavailable',reason:'READ',error:'Camera is powered down'},obstacles:{mode:'unavailable',reason:'READ'}};
for(const mode of ['playing','paused','stopped'])assert.equal(d.runtime({ignition:false,guidelines,player:{mode}}),'','Powered-down cameras are irrelevant to archive playback');
assert(d.runtime({ignition:true,guidelines}).includes('D_LINES] READ'),'Keep diagnostics while cameras may be used');
assert(d.runtime({ignition:null,guidelines}).includes('D_LINES] READ'),'Unknown ignition must not mask control failures');
assert(d.runtime({ignition:false,guidelines,player:{mode:'error'}}).includes('D_PREVIEW_GPU'),'Keep archive decoder failures');
assert(d.runtime({ignition:false,guidelines,error:'archive read failed'}).includes('D_ARCHIVE'),'Keep archive storage failures');
console.log('PASS archive diagnostics ignore powered-down overlay controls; live and archive faults remain visible');
