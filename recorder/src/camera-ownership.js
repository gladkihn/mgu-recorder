'use strict';
// Public service observations only; no process memory or firmware hashes.
const policy=require('./policy');
class Ownership{
 constructor(o){this.now=o&&o.now||Date.now;this.state=null;}
 update(cookie,icam,xview,ready){this.state={cookie,icam,xview,ready,at:this.now()};}
 invalidate(){this.state=null;}
 snapshot(){const s=this.state;return s&&Object.assign({},s,{fresh:this.now()>=s.at&&this.now()-s.at<1000});}
}
// Effective own request is not proof of exclusive use; OEM visibility is gated separately.
function effectiveRequest(s,cookie){return !!(s&&s.fresh&&Number.isInteger(cookie)&&cookie>=0&&s.cookie===cookie&&s.ready==='CAMERA_READY'&&policy.SAME(s.icam,policy.REQUEST)&&policy.SAME(s.xview,policy.REQUEST));}
module.exports={Ownership,effectiveRequest};
