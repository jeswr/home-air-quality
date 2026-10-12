import {readingsFrom} from './amazon.mjs';
import {capabilitiesFrom} from './capabilities.mjs';
const reasons=new Map([
  ['Amazon rejected this session. Sign in again.','session_rejected'],
  ['Amazon could not return readings. Check that the monitor is online.','state_unavailable'],
  ['No recognised sensor readings were returned by Amazon.','no_sensor_values'],
  ['Amazon could not return monitor capabilities.','capabilities_unavailable'],
  ['Amazon returned an unexpected response. Sign in again.','unexpected_response'],
]);
export async function readMonitor(amazon,device,{pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),report=()=>{}}={}) {
  for(let attempt=1;attempt<=3;attempt++) {
    let state;
    try {
      state=await amazon('/api/phoenix/state',{stateRequests:[{entityId:device.id,entityType:'APPLIANCE'}]});
      return {id:device.id,name:device.name,readings:readingsFrom(state,device.id),capabilities:capabilitiesFrom(state,device.id)};
    }catch(error){
      const message=error instanceof Error?error.message:'';
      const http=message.match(/^Amazon returned HTTP (\d{3})\. Try again later\.$/);
      // Counts and fixed reason codes only; no response bodies, identifiers or arbitrary strings.
      const diagnostics={attempt,reason:http?'http_'+http[1]:reasons.get(message) || 'network_or_unexpected_error',
        states:Array.isArray(state?.deviceStates)?state.deviceStates.length:null,errors:Array.isArray(state?.errors)?state.errors.length:null,
        stateError:Array.isArray(state?.deviceStates) && state.deviceStates.some(s=>Boolean(s?.error)),
        capabilities:Array.isArray(state?.deviceStates)?state.deviceStates.reduce((n,s)=>n+(Array.isArray(s?.capabilityStates)?s.capabilityStates.length:0),0):null};
      report(diagnostics);
      if(diagnostics.reason==='session_rejected' || attempt===3)throw new Error(diagnostics.reason);
      await pause(attempt*3000);
    }
  }
}
