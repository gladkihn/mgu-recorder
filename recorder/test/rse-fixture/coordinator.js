'use strict';
// No connection, decoder, surface or external-controller request without demand.
class Coordinator{
 constructor(o){this.o=o;this.clients=o.clients.map(c=>Object.assign({},c,{active:false,session:null,closedSession:null,closeSeq:0,presenter:null,status:{phase:'idle'}}));this.feed=o.feed;this.feed.on('state',()=>this.reconcile());this.feed.on('frame',b=>this.frame(b));this.enabled=true;this.stopping=false;this.published='';}
 tick(){if(this.stopping)return;const now=this.o.now();for(const c of this.clients){const l=this.o.readLease(c,now);c.session=l&&l.session;c.active=!!(this.enabled&&l&&l.session!==c.closedSession);if(!c.active)this.stop(c);}const wanted=this.clients.some(c=>c.active);if(wanted!==this.feed.wanted)this.feed.setDemand(wanted);this.feed.tick();this.reconcile();this.publish();}
 reconcile(){const live=this.feed.state().ready;for(const c of this.clients){if(!c.active||!live)this.stop(c);else if(!c.presenter&&!c.stopping&&this.o.now()>=(c.retryAt||0)){try{let p;p=this.o.startPresenter(c,this.feed.source,(status)=>{if(c.presenter!==p)return;c.status=status;this.publish();},(error)=>{if(c.presenter===p)this.presenterClosed(c.side,error);});c.presenter=p;c.status={phase:'starting'};}catch(e){c.status={phase:'unavailable',error:e.message};c.retryAt=this.o.now()+1500;}}else if(c.presenter)try{c.presenter.source(this.feed.source);}catch(e){this.fault(c,e);}}this.publish();}
 frame(b){for(const c of this.clients)if(c.active&&c.presenter)try{c.presenter.frame(b);}catch(e){this.fault(c,e);}}
 fault(c,e){this.stop(c);c.status={phase:'unavailable',error:e.message};c.retryAt=this.o.now()+1500;}
 stop(c){if(!c.presenter)return;const p=c.presenter;c.presenter=null;c.status={phase:'idle'};c.stopping=p;try{Promise.resolve(p.stop()).then(()=>{if(c.stopping===p)c.stopping=null;},e=>{if(c.stopping===p)c.stopping=null;c.status={phase:'unavailable',error:e.message};});}catch(e){c.stopping=null;c.status={phase:'unavailable',error:e.message};}}
 presenterClosed(side,error){const c=this.clients.find(c=>c.side===side);if(!c)return;c.presenter=null;c.status={phase:'unavailable',error:error||'decoder-closed'};c.retryAt=this.o.now()+1500;this.publish();}
 tap(side){const c=this.clients.find(c=>c.side===side);if(!c||!c.active)return;c.closedSession=c.session;c.closeSeq++;c.active=false;this.stop(c);if(!this.clients.some(c=>c.active))this.feed.setDemand(false);this.publish();}
 publish(){const s=this.feed.state(),v={version:2,enabled:this.enabled,connected:s.connected,ready:s.ready,source:s.source,reason:s.reason,clients:this.clients.map(c=>({uid:c.uid,side:c.side,active:c.active,session:c.session,closeSeq:c.closeSeq,status:c.status}))};try{this.o.publish(v);}catch(e){if(this.o.onFault)this.o.onFault(e);}}
 close(){this.stopping=true;for(const c of this.clients){c.active=false;this.stop(c);}this.feed.close();this.publish();}
}
module.exports={Coordinator};
