import test from 'node:test';
import assert from 'node:assert/strict';
import {readMonitor} from './monitor.mjs';
const device={id:'private-device-id',name:'Bedroom'};
const state={deviceStates:[{entityId:device.id,capabilityStates:[{namespace:'Alexa.RangeController',name:'rangeValue',instance:'5',value:0,timeOfSample:'2026-10-12T09:00:00Z'}]}]};
test('a transient state failure is retried and zero-valued readings are saved',async()=>{
  let attempts=0;const reports=[];
  const monitor=await readMonitor(async()=>++attempts===1?{errors:[{message:'private-account-data'}]}:state,device,{pause:async()=>{},report:r=>reports.push(r)});
  assert.equal(attempts,2);assert.equal(monitor.readings[0].value,0);assert.equal(reports[0].reason,'state_unavailable');
  assert.ok(!JSON.stringify(reports).includes('private-account-data'));
});
test('unavailable responses have a bounded retry count and cannot log arbitrary exception data',async()=>{
  let attempts=0;const reports=[];
  await assert.rejects(readMonitor(async()=>{attempts++;throw new Error('secret-token-in-error');},device,{pause:async()=>{},report:r=>reports.push(r)}));
  assert.equal(attempts,3);assert.ok(!JSON.stringify(reports).includes('secret-token'));
});
test('a rejected session stops state retries so the caller can refresh authentication',async()=>{
  let attempts=0;
  await assert.rejects(readMonitor(async()=>{attempts++;throw new Error('Amazon rejected this session. Sign in again.');},device,{pause:async()=>{}}),/session_rejected/);
  assert.equal(attempts,1);
});
test('malformed state shapes are retried without breaking diagnostic reporting',async()=>{
  let attempts=0;const reports=[];
  const monitor=await readMonitor(async()=>++attempts===1?{deviceStates:{secret:'never log this'}}:state,device,{pause:async()=>{},report:r=>reports.push(r)});
  assert.equal(monitor.readings[0].value,0);assert.equal(reports[0].states,null);assert.ok(!JSON.stringify(reports).includes('never log'));
});
