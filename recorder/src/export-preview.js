'use strict';
// Free the live compositor during software export; never undo a newer user action.
async function suspend(media,current){
 if(!media.liveMode||media.paused)return async()=>{};
 const state=media.state,token=media.token;await media.pause();let done=false;
 return async()=>{if(done)return;done=true;if(current()&&media.liveMode&&media.paused&&media.state===state&&media.token===token)await media.pause();};
}
module.exports={suspend};
