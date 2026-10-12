import test from 'node:test';
import assert from 'node:assert/strict';
import { monitorsFrom, readingsFrom, sessionRegion, websiteOrigin } from './amazon.mjs';

test('uses the authenticated account region and rejects external service addresses', () => {
  assert.equal(sessionRegion({ amazonPage: 'amazon.com.au' }), 'amazon.com.au');
  assert.equal(websiteOrigin('https://fe-api-alexa.amazon.com.au', 'amazon.com.au'), 'https://fe-api-alexa.amazon.com.au');
  assert.throws(() => sessionRegion({ amazonPage: 'attacker.example' }));
  assert.throws(() => websiteOrigin('https://amazon.com.au.attacker.example', 'amazon.com.au'));
  assert.throws(() => websiteOrigin('http://fe-api-alexa.amazon.com.au', 'amazon.com.au'));
  assert.throws(() => websiteOrigin('https://fe-api-alexa.amazon.com.au:8443', 'amazon.com.au'));
});

test('discovers air monitors, deduplicates and excludes unrelated devices', () => {
  const monitor = { friendlyName: '<Kitchen>', displayCategories: { primary: { value: 'AIR_QUALITY_MONITOR' } }, legacyAppliance: { applianceId: 'monitor-1' } };
  assert.deepEqual(monitorsFrom({ data: { endpoints: { items: [monitor, monitor, { friendlyName: 'Lamp', legacyAppliance: { applianceId: 'lamp' } }] } } }), [{ id: 'monitor-1', name: '<Kitchen>' }]);
});
test('preserves zero values, converts Fahrenheit, rejects unknown/non-numeric fields', () => {
  const payload = { deviceStates: [{ entity: { entityId: 'monitor-1' }, capabilityStates: [
    JSON.stringify({ instance: '3', value: { value: 68, scale: 'FAHRENHEIT' }, timeOfSample: '2026-10-07T12:00:00Z' }),
    JSON.stringify({ instance: '8', value: 0 }),
    { instance: '4', value: null }, { instance: '777', value: 23 }, 'invalid JSON'
  ] }] };
  const values = readingsFrom(payload, 'monitor-1');
  assert.equal(values.length, 2); assert.equal(values[0].value, 20);
  assert.equal(values[0].unit, '°C'); assert.equal(values[1].value, 0);
});
test('includes the discovered PM10 channel without inventing its missing unit', () => {
  const payload = {deviceStates: [{entityId: 'monitor-1', capabilityStates: [{instance: '7', value: 1, timeOfSample: '2026-10-11T14:00:00Z'}]}]};
  assert.deepEqual(readingsFrom(payload, 'monitor-1'), [{key: 'pm10', label: 'PM10', value: 1, unit: 'unit not provided', observedAt: '2026-10-11T14:00:00Z'}]);
});
test('unavailable and malformed responses never become apparent live readings', () => {
  assert.throws(() => readingsFrom({ errors: [{ code: 'ENDPOINT_UNREACHABLE' }] }, 'monitor-1'));
  assert.throws(() => readingsFrom({ deviceStates: [{ capabilityStates: [] }] }, 'monitor-1'));
  assert.throws(() => monitorsFrom({ data: null }));
  assert.throws(() => monitorsFrom({ errors: [{ message: 'Unauthenticated call' }], data: { endpoints: null } }), /authentication/);
});
test('reads the monitor temperature capability without an instance identifier', () => {
  const payload = {deviceStates: [{entityId: 'monitor-1', capabilityStates: [
    {namespace: 'Alexa.TemperatureSensor', name: 'temperature',
      value: {value: 16.25, scale: 'CELSIUS'}, timeOfSample: '2026-10-10T14:11:13Z'},
    {namespace: 'Alexa.EndpointHealth', name: 'connectivity', value: {value: 'OK'}}
  ]}]};
  assert.deepEqual(readingsFrom(payload, 'monitor-1'), [{key: 'temperature',
    label: 'Temperature', value: 16.25, unit: '°C', observedAt: '2026-10-10T14:11:13Z'}]);
  payload.deviceStates[0].capabilityStates[0].value = {value: 68, scale: 'FAHRENHEIT'};
  assert.equal(readingsFrom(payload, 'monitor-1')[0].value, 20);
});
