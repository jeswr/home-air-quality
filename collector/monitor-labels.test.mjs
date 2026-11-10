import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {labelMonitors,monitorName} from './monitor-labels.mjs';
test('pinned room identities survive reordered discovery and identical generic names',()=>{
 const hash=id=>createHash('sha256').update(id).digest('hex');
 const rooms=Object.fromEntries(['Living room','Bedroom','Hall'].map((name,i)=>[hash(`private-device-${i}`),{name,order:i+1}]));
 const devices=[2,0,1].map(i=>({id:`private-device-${i}`,name:'Air quality monitor'}));
 assert.deepEqual(labelMonitors(devices,rooms).map(m=>[m.id,m.name]),[['private-device-0','Living room'],['private-device-1','Bedroom'],['private-device-2','Hall']]);
 assert.equal(monitorName('private-device-1','old name',rooms),'Bedroom');
 assert.ok(!JSON.stringify(rooms).includes('private-device'));
 assert.equal(monitorName('new device','New room',rooms),'New room');
});
