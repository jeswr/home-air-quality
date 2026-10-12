import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilitiesFrom, declaredCapabilitiesFrom } from './capabilities.mjs';

test('preserves API precision, health status and sample times while dropping private fields', () => {
  const payload = {accountToken: 'secret', deviceStates: [{entityId: 'device', capabilityStates: [
    JSON.stringify({namespace: 'Alexa.TemperatureSensor', name: 'temperature', value: {value: 17.257, scale: 'CELSIUS', secret: 'hidden'}, timeOfSample: '2026-10-11T14:00:00Z', uncertaintyInMilliseconds: 0, cookie: 'secret'}),
    {namespace: 'Alexa.EndpointHealth', name: 'connectivity', value: {value: 'OK', token: 'secret'}},
    {namespace: 'Unknown', name: 'value', value: 'private account string'},
    {namespace: 'Alexa.RangeController', instance: '7', name: 'rangeValue', value: 0},
    'invalid'
  ]}]};
  const data = capabilitiesFrom(payload, 'device');
  assert.equal(data.length, 4);
  assert.deepEqual(data[0].value, {value: 17.257, scale: 'CELSIUS'});
  assert.deepEqual(data[1].value, {value: 'OK'});
  assert.equal(data[2].value.omitted, true);
  assert.equal(data[3].value, 0);
  assert.ok(!JSON.stringify(data).includes('secret'));
  assert.ok(!JSON.stringify(data).includes('private account string'));
});

test('reads declared PM10 label, range and absent unit without saving arbitrary configuration', () => {
  const data = declaredCapabilitiesFrom([{interfaceName: 'Alexa.RangeController', instance: '7',
    resources: {friendlyNames: [{value: {text: 'Particulate matter PM10'}}]},
    configuration: {unitOfMeasure: '', supportedRange: {minimumValue: 0, maximumValue: 1000, precision: 1}, token: 'secret'},
    properties: {retrievable: true, readOnly: true}, accountId: 'secret'}]);
  assert.deepEqual(data[0].labels, ['Particulate matter PM10']);
  assert.equal(data[0].unitOfMeasure, '');
  assert.equal(data[0].range.maximumValue, 1000);
  assert.ok(!JSON.stringify(data).includes('secret'));
});

test('unavailable capability state cannot look like a successful inspection', () => {
  assert.throws(() => capabilitiesFrom({deviceStates: [{error: 'offline'}]}, 'device'));
});
