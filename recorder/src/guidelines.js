'use strict';
const fs=require('fs'),path=require('path'),{exclusive}=require('./camera-ownership');
const normalize=v=>v==='ON'||v===1?'ON':v==='OFF'||v===0?'OFF':null;
const monotonic=()=>{const t=process.hrtime();return t[0]*1000+t[1]/1e6;};
class Journal{
 constructor(file){this.file=file;this.inode=null;}
 load(){try{const s=fs.lstatSync(this.file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>4096)throw Error('Unsafe line restoration journal');const v=JSON.parse(fs.readFileSync(this.file,'utf8'));if([1,2].indexOf(v.schema)<0||!normalize(v.original)||v.schema===2&&v.owner!=='owner-dvr')throw Error('Invalid line restoration journal');this.inode=s.ino;return v;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 syncDir(){if(process.platform==='win32')return;const fd=fs.openSync(path.dirname(this.file),'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 save(original){const fd=fs.openSync(this.file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);try{this.inode=fs.fstatSync(fd).ino;fs.writeFileSync(fd,JSON.stringify({schema:2,owner:'owner-dvr',original})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}this.syncDir();}
 clear(){const s=fs.lstatSync(this.file);if(s.ino!==this.inode||!s.isFile()||s.isSymbolicLink())throw Error('Line journal changed');fs.unlinkSync(this.file);this.inode=null;this.syncDir();}
}
class Guidelines{
 constructor(o){this.o=o;this.now=o.now||monotonic;this.cookie=null;this.owned=false;this.original=null;this.phase=null;this.quietSince=null;this.blockedCookie=null;this.retryAt=0;this.failures=0;this.lastVerified=0;this.state={mode:'waiting',error:null,restorationPending:false};}
 target(cookie){if(cookie!==this.cookie){this.blockedCookie=null;this.retryAt=0;this.failures=0;this.quietSince=null;this.cookie=cookie;if(this.owned)this.phase='restoring';}}
 eligible(){return Number.isInteger(this.cookie)&&this.o.allowed()&&exclusive(this.o.ownership(),this.cookie);}
 async set(value){let failure=null;try{await this.o.write(value);}catch(e){failure=e;}const until=monotonic()+(this.o.confirmMs===undefined?750:this.o.confirmMs);do{try{if(normalize(await this.o.read())===value)return value;}catch(e){if(!failure)failure=e;}if(monotonic()>=until)break;await new Promise(r=>setTimeout(r,50));}while(true);throw failure||Error('Line setting was not confirmed');}
 async recover(){const saved=this.o.journal.load();if(!saved)return;this.original=normalize(saved.original);this.owned=true;this.phase='restoring';this.state.restorationPending=true;await this.restore();}
 async restore(){if(!this.owned){const saved=this.o.journal.load();if(saved){this.original=normalize(saved.original);this.owned=true;}}if(!this.owned){this.state.mode='waiting';return;}
  this.phase='restoring';this.state.restorationPending=true;const actual=normalize(await this.o.read()),changed=actual!==this.original;if(changed){this.quietSince=null;await this.set(this.original);}if(normalize(await this.o.read())!==this.original)throw Error('Restoration not confirmed');
  // A successful getter is not the end of a native handoff: the OEM may apply
  // a queued OFF after it. Retain the original journal throughout that handoff.
  this.state={mode:'restoring-native',error:null,restorationPending:true};return changed;
 }
 async finishRestore(){if(!this.owned){await this.restore();if(!this.owned)return;}const begin=this.now(),hold=this.o.finalHoldMs===undefined?900:this.o.finalHoldMs,limit=this.o.finalLimitMs===undefined?2500:this.o.finalLimitMs;let stable=null;
  do{const changed=await this.restore(),now=this.now();if(changed||stable===null)stable=now;if(now-stable>=hold){this.o.journal.clear();this.owned=false;this.original=null;this.phase=null;this.quietSince=null;this.state={mode:'restored',error:null,restorationPending:false};return;}if(now-begin>=limit)break;await new Promise(r=>setTimeout(r,50));}while(true);throw Error('Line restoration did not settle');
 }
 async tick(){try{let ok=false;try{ok=this.eligible();}catch(e){this.state.error=e.message;}if(!ok){this.quietSince=null;await this.restore();return;}
   if(this.blockedCookie===this.cookie&&(this.now()<this.retryAt||this.failures>3)){await this.restore();return;}
   if(this.owned&&this.phase==='restoring'){await this.restore();if(this.quietSince===null)this.quietSince=this.now();const hold=this.o.handoffQuietMs===undefined?2000:this.o.handoffQuietMs;if(this.now()-this.quietSince<hold){this.state.mode='handoff-hold';return;}if(!this.eligible()){this.quietSince=null;return;}await this.set('OFF');if(!this.eligible()){await this.restore();return;}this.phase='suppressed';this.lastVerified=this.now();this.state={mode:'suppressed',error:null,restorationPending:true};return;}
   if(this.owned&&this.state.error){await this.restore();return;}
   if(this.owned){if(this.now()-this.lastVerified<1000){this.state.mode='suppressed';return;}const value=normalize(await this.o.read());this.lastVerified=this.now();if(value==='OFF'){this.state.mode='suppressed';return;}this.blockedCookie=this.cookie;this.retryAt=Infinity;await this.restore();this.state.mode='externally-restored';return;}
   if(this.blockedCookie===this.cookie)this.blockedCookie=null;
   const original=normalize(await this.o.read());if(!original)throw Error('Unknown trajectory setting');if(original==='OFF'){this.state={mode:'already-off',error:null,restorationPending:false};this.blockedCookie=this.cookie;return;}
   this.o.journal.save(original);this.original=original;this.owned=true;this.state.restorationPending=true;
   if(!this.eligible()){await this.restore();return;}await this.set('OFF');if(!this.eligible()){await this.restore();return;}this.phase='suppressed';this.lastVerified=this.now();this.state={mode:'suppressed',error:null,restorationPending:true};
  }catch(e){const message=e.message;this.blockedCookie=this.cookie;this.retryAt=this.now()+5000;this.failures++;try{await this.restore();}catch(restore){this.state.restorationPending=true;this.state.restoreError=restore.message;}this.state.error=message;this.state.mode='unavailable';}
 }
}
module.exports={Guidelines,Journal,normalize};
