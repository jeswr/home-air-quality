import cookieHelper from 'alexa-cookie2';
import { createAmazonClient } from './amazon_client.mjs';
import { endpointQuery, monitorsFrom, readingsFrom, sessionRegion } from './amazon.mjs';
import { capabilitiesFrom } from './capabilities.mjs';
import { sealSession, openSession } from './session.mjs';
import { siteClient } from './site-client.mjs';
const {SITE_URL,SITE_BEARER,COLLECTOR_TOKEN,SESSION_KEY}=process.env;
if(!SITE_URL || !SITE_BEARER || !COLLECTOR_TOKEN || !SESSION_KEY) { console.error('Cloud collector secrets are not configured.');process.exit(1); }
const call=siteClient({siteUrl:SITE_URL,siteBearer:SITE_BEARER,collectorToken:COLLECTOR_TOKEN});
let errorStage='session';
async function refresh(session) {
  return new Promise((resolve,reject)=>cookieHelper.refreshAlexaCookie({amazonPage:sessionRegion(session),baseAmazonPage:'amazon.com',acceptLanguage:'en-GB',
    formerRegistrationData:session,logger:()=>{},proxyLogLevel:'silent',deviceAppName:'Local Air Quality Dashboard'},(err,result)=>{
    if(err || !result?.localCookie)reject(new Error('Amazon session refresh failed.'));
    else resolve({...result,savedAt:Date.now()});
  }));
}
try {
  let session=openSession(await call('/api/collector/session'),SESSION_KEY);
  if(!session.savedAt || Date.now()-session.savedAt>5*86400000) {
    session=await refresh(session);
    await call('/api/collector/session',sealSession(session,SESSION_KEY));
  }
  errorStage='amazon';
  const amazon=createAmazonClient(()=>session);
  const devices=monitorsFrom(await amazon('/nexus/v1/graphql',{query:endpointQuery}));
  if(!devices.length)throw new Error('No monitor found.');
  const monitors=[];
  for(const device of devices) {
    try {
      const state=await amazon('/api/phoenix/state',{stateRequests:[{entityId:device.id,entityType:'APPLIANCE'}]});
      monitors.push({id:device.id,name:device.name,readings:readingsFrom(state,device.id),capabilities:capabilitiesFrom(state,device.id)});
    } catch {monitors.push({id:device.id,name:device.name,readings:[],error:'Monitor readings unavailable.'});}
  }
  errorStage='storage';
  const result=await call('/api/collector',{connected:true,fetchedAt:new Date().toISOString(),monitors});
  console.log(`Cloud collection saved ${result.added} new sensor readings.`);
  if(monitors.some(m=>m.error)) {console.error('A monitor could not return readings. Check that it is powered and online.');process.exitCode=1;}
} catch {
  // Deliberately do not log Amazon responses, exception bodies, or authentication data.
  console.error(`Cloud collection failed at ${errorStage}. Check the monitor or refresh the saved Amazon session from the Mac.`);
  try {await call('/api/collector',{connected:true,fetchedAt:new Date().toISOString(),error:'Cloud collection failed.',monitors:[]});}catch{}
  process.exitCode=1;
}
