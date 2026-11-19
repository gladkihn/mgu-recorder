'use strict';
const fs=require('fs'),path=require('path');
function appUid(){const root='/var/opt/public/oap',found=[];let saved=0;try{const a=JSON.parse(fs.readFileSync('/var/opt/mgu-deploy/state.json')).apps.owner_dvr;if(a&&Number.isInteger(a.uid))saved=a.uid;}catch(e){}for(const n of fs.readdirSync(root)){try{const a=JSON.parse(fs.readFileSync(path.join(root,n,'data/apps/owner_dvr.json')));if(!Number.isInteger(a.userId)||a.userId<12000||a.userId>=15000)continue;const p=JSON.parse(fs.readFileSync(path.join(root,'oap_'+a.userId,'source/package.json')));if(p.name==='owner_dvr'&&found.indexOf(a.userId)<0)found.push(a.userId);}catch(e){}}if(found.length===1)return found[0];if(found.length>1)return found.indexOf(saved)>=0?saved:0;return 0;}
module.exports={appUid};
