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
 constructor(o){this.o=o;this.cookie=null;this.owned=false;this.original=null;this.blockedCookie=null;this.retryAt=0;this.failures=0;this.lastVerified=0;this.state={mode:'waiting',error:null,restorationPending:false};}
 target(cookie){if(cookie!==this.cookie){this.blockedCookie=null;this.retryAt=0;this.failures=0;this.cookie=cookie;}}
 eligible(){return Number.isInteger(this.cookie)&&this.o.allowed()&&exclusive(this.o.ownership(),this.cookie);}
 async set(value){let failure=null;try{await this.o.write(value);}catch(e){failure=e;}const until=monotonic()+(this.o.confirmMs===undefined?750:this.o.confirmMs);do{try{if(normalize(await this.o.read())===value)return value;}catch(e){if(!failure)failure=e;}if(monotonic()>=until)break;await new Promise(r=>setTimeout(r,50));}while(true);throw failure||Error('Line setting was not confirmed');}
 async recover(){const saved=this.o.journal.load();if(!saved)return;this.original=normalize(saved.original);this.owned=true;this.state.restorationPending=true;await this.restore();}
 async restore(){if(!this.owned){const saved=this.o.journal.load();if(saved){this.original=normalize(saved.original);this.owned=true;}}if(!this.owned){this.state.mode='waiting';return;}
  this.state.restorationPending=true;const actual=normalize(await this.o.read());if(actual!==this.original)await this.set(this.original);if(normalize(await this.o.read())!==this.original)throw Error('Restoration not confirmed');this.o.journal.clear();this.owned=false;this.original=null;this.state={mode:'restored',error:null,restorationPending:false};
 }
 async tick(){try{let ok=false;try{ok=this.eligible();}catch(e){this.state.error=e.message;}if(!ok){await this.restore();return;}
   if(this.owned&&this.state.error){await this.restore();return;}
   if(this.owned){if(monotonic()-this.lastVerified<1000){this.state.mode='suppressed';return;}const value=normalize(await this.o.read());this.lastVerified=monotonic();if(value==='OFF'){this.state.mode='suppressed';return;}this.blockedCookie=this.cookie;this.retryAt=Infinity;await this.restore();this.state.mode='externally-restored';return;}
   if(this.blockedCookie===this.cookie){if(monotonic()<this.retryAt||this.failures>3)return;this.blockedCookie=null;}
   const original=normalize(await this.o.read());if(!original)throw Error('Unknown trajectory setting');if(original==='OFF'){this.state={mode:'already-off',error:null,restorationPending:false};this.blockedCookie=this.cookie;return;}
   this.o.journal.save(original);this.original=original;this.owned=true;this.state.restorationPending=true;
   if(!this.eligible()){await this.restore();return;}await this.set('OFF');if(!this.eligible()){await this.restore();return;}this.lastVerified=monotonic();this.state={mode:'suppressed',error:null,restorationPending:true};
  }catch(e){const message=e.message;this.blockedCookie=this.cookie;this.retryAt=monotonic()+5000;this.failures++;try{await this.restore();}catch(restore){this.state.restorationPending=true;this.state.restoreError=restore.message;}this.state.error=message;this.state.mode='unavailable';}
 }
}
module.exports={Guidelines,Journal,normalize};
