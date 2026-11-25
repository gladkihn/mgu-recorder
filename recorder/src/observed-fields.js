'use strict';
// Cached native fields: notifications, one initial read, and bounded write confirmation.
class ObservedField{
 constructor(proxy,name,changed){this.proxy=proxy;this.name=name;this.changed=changed;this.valid=false;this.available=true;this.revision=0;this.loading=null;}
 receive(value){if(!this.available)return;this.value=value;this.valid=true;this.revision++;this.changed();}
 unavailable(){this.available=false;this.valid=false;this.loading=null;this.revision++;this.changed();}
 async refresh(){if(this.loading)return this.loading;if(!this.available)throw Error('Native field unavailable: '+this.name);const before=this.revision;
  const operation=(async()=>{const value=await this.proxy.getValue(this.name,500);if(this.available&&this.revision===before)this.receive(value);})();
  this.loading=operation;try{await operation;}finally{if(this.loading===operation)this.loading=null;}
 }
 read(){if(!this.available||!this.valid)throw Error('Native field unavailable: '+this.name);return this.value;}
 async write(value){const revision=this.revision;let error=null;try{await this.proxy.setValue(this.name,value,700);}catch(e){error=e;}
  // A confirmed notification avoids an extra getter after the setter.
  if(!(this.valid&&this.revision>revision&&this.value===value))try{await this.refresh();}catch(e){if(!error)error=e;}
  if(error)throw error;
 }
}
async function observe(proxy,names,changed){const fields={};for(const name of names){const f=fields[name]=new ObservedField(proxy,name,changed);await proxy.subscribe({name,onReceive:value=>f.receive(value)});}
 let available=null;await proxy.subscribeToAvailability(on=>{if(available===!!on)return;available=!!on;for(const name of names){const f=fields[name];if(!on)f.unavailable();else{f.available=true;f.refresh().catch(()=>changed());}}});
 await Promise.all(names.map(name=>fields[name].refresh().catch(()=>{})));return fields;
}
module.exports={ObservedField,observe};
