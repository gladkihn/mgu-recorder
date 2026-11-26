'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const parser={exports:{}};
new Function('module','exports',process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'])(parser,parser.exports);
const root=path.resolve(__dirname,'..');let count=0;
function visit(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())visit(file);else if(name.endsWith('.js')){parser.exports.parse(fs.readFileSync(file,'utf8'),{ecmaVersion:2017,allowReturnOutsideFunction:true});count++;}}}
visit(path.join(root,'recorder/src'));visit(path.join(root,'recorder/ui'));assert(count>50);
console.log('PASS '+count+' production modules parse as ES2017 for target Node 8.7');
