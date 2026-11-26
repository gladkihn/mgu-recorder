'use strict';
const {Recorder}=require('./kit/record');
// Bake the fixed 1.1 UI size into drawing commands. Renderer placement stays 1:1.
// OP_XF is deliberately avoided: it uses physical screen coordinates, losing appArea offsets.
function physicalRecorder(w,h,scale){const r=new Recorder(w,h),methods={fillRect:[0,1,2,3],roundRect:[0,1,2,3,4],strokeRoundRect:[0,1,2,3,4,5],video:[1,2,3,4,5]};for(const name of Object.keys(methods)){const fn=r[name].bind(r);r[name]=function(){const args=Array.prototype.slice.call(arguments);for(const i of methods[name])if(typeof args[i]==='number')args[i]*=scale;return fn.apply(null,args);};}const text=r.text.bind(r);r.text=(str,x,y,size,color,opts)=>text(str,x*scale,y*scale,size*scale,color,opts);for(const name of ['quad','polyline']){const fn=r[name].bind(r);r[name]=(points,a,b)=>fn(points.map(p=>[p[0]*scale,p[1]*scale]),name==='polyline'?a*scale:a,b);}return r;}
module.exports={physicalRecorder};
