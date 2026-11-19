'use strict';
// Reads the target ABI and catalogue; sends no vehicle/control requests.
const fs=require('fs'),os=require('os'),cat=require('./catalog');
function inspect(o){o=o||{};const f=o.fs||fs,arch=o.arch||os.arch(),errors=[];
 if(arch!=='x64')errors.push('Recorder requires x86_64 MGU');
 for(const p of ['/usr/bin/icam2proxy','/usr/bin/ivi-control','/usr/lib/oap-mainapp/node_modules/someip.node','/lib/ld-linux-x86-64.so.2'])if(!f.existsSync(p))errors.push('Target lacks '+p);
 try{if(f.statSync('/mnt/share').dev===f.statSync('/var/opt').dev)errors.push('HDD is not mounted');}catch(e){errors.push('HDD mount unavailable');}
 try{const c=JSON.parse(f.readFileSync('/etc/oap/someip/someip-interfaces.json'));
  cat.select(c,'de.bmw.infotainment.video.cameraproxy.ICAM2Proxy',['currentState','cameraProxyState'],['clientAttach','clientDetach','changeState']);
  cat.select(c,'de.bmw.dass.XView3D',['CurrentState'],[]);
  cat.select(c,'de.bmw.infrastructure.VehicleCondition',['vehicleConditionNoCrc'],[]);
 }catch(e){errors.push('Camera/vehicle catalogue: '+e.message);}
 return {supported:!errors.length,errors,vinRequired:false,firmwareChanged:false};
}
function requireSupport(o){const r=inspect(o);if(!r.supported)throw Error(r.errors.join('; '));return r;}
module.exports={inspect,requireSupport};
