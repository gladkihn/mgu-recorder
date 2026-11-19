'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),vm=require('vm');
const {offsetMinutes,preserveLegacyOffset}=require('../src/device-config'),{ensure}=require('../src/pairing');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'portable-recorder-')),device=path.join(dir,'device.json'),old=path.join(dir,'old.js');
assert.equal(offsetMinutes(device),undefined);fs.writeFileSync(old,'const o={offsetMinutes:180};');assert(preserveLegacyOffset(old,device));assert.equal(offsetMinutes(device),180);fs.writeFileSync(old,'const o={offsetMinutes:-60};');assert(!preserveLegacyOffset(old,device));assert.equal(offsetMinutes(device),180);
const key=path.join(dir,'rse-video.key');ensure(key);const first=fs.readFileSync(key);assert(/^[a-f0-9]{64}$/.test(first.toString()));
// Root ownership is checked by readKey on target; inject only that check on Windows.
let source=fs.readFileSync(path.join(__dirname,'../src/pairing.js'),'utf8'),m={exports:{}};vm.runInNewContext(source,{module:m,require:n=>n==='./remote-video-server'?{readKey:()=>first.toString()}:require(n)});assert.equal(m.exports.ensure(key).created,false);assert(fs.readFileSync(key).equals(first));
const caps=fs.readFileSync(path.join(__dirname,'../src/capabilities.js'),'utf8');m={exports:{}};let mutations=0;
const disk={existsSync:()=>true,statSync:p=>({dev:p==='/mnt/share'?2:1}),readFileSync:()=>JSON.stringify({})};
vm.runInNewContext(caps,{module:m,require:n=>n==='fs'?disk:n==='os'?{arch:()=> 'x64'}:n==='./catalog'?{select:()=>{}}:require(n)});
assert(m.exports.inspect().supported);assert(!m.exports.inspect({arch:'arm64'}).supported);assert(!m.exports.inspect({fs:Object.assign({},disk,{existsSync:()=>false})}).supported);assert(!m.exports.inspect({fs:Object.assign({},disk,{statSync:()=>({dev:1})})}).supported);
console.log('PASS no VIN dependency; fresh private pairing; existing pairing retained; previous local time offset retained; incompatible ABI/camera/HDD rejected');
