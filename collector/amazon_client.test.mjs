import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmazonClient } from './amazon_client.mjs';

test('shares regional routing and invalidates it when the saved session changes', async () => {
  let session = {localCookie: 'csrf=test', amazonPage: 'amazon.co.uk'};
  const calls = [];
  const request = createAmazonClient(() => session, async (url, options) => {
    calls.push({url, options});
    return {ok: true, json: async () => url.endsWith('/api/endpoints')
      ? {websiteApiUrl: 'https://fe-api-alexa.' + session.amazonPage} : {readings: true}};
  });
  await request('/api/phoenix/state', {});
  await request('/api/phoenix/state', {});
  assert.equal(calls.filter(call => call.url.endsWith('/api/endpoints')).length, 1);
  session = {localCookie: 'csrf=changed', amazonPage: 'amazon.com.au'};
  await request('/api/phoenix/state', {});
  assert.equal(calls.at(-1).url, 'https://fe-api-alexa.amazon.com.au/api/phoenix/state');
  assert.equal(calls.at(-1).options.headers.csrf, 'changed');
  assert.ok(calls.every(call => call.options.redirect === 'error'));
});

test('refuses untrusted regional routing before sending the session to another host', async () => {
  let calls = 0;
  const request = createAmazonClient(() => ({localCookie: 'csrf=test', amazonPage: 'amazon.co.uk'}), async () => {
    calls++;
    return {ok: true, json: async () => ({websiteApiUrl: 'https://attacker.example'})};
  });
  await assert.rejects(request('/api/phoenix/state', {}), /unexpected regional/);
  assert.equal(calls, 1);
});
