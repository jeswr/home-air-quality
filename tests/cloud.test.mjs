import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { CloudHistory } from '../lib/history.mjs';
import { sealSession,openSession } from '../collector/session.mjs';
import { siteClient } from '../collector/site-client.mjs';
const migration=readFileSync(new URL('../drizzle/0000_lazy_nightmare.sql',import.meta.url),'utf8');
function database() {
  const sql=new DatabaseSync(':memory:');sql.exec(migration);
  const prepare=query=>({bind(...args){return {async first(){return sql.prepare(query).get(...args) || null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:sql.prepare(query).run(...args)};}};}});
  return {sql,prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
const at='2026-10-12T08:00:00.000Z';
const sample={connected:true,fetchedAt:at,monitors:[{id:'private-id',name:'Bedroom',readings:['iaq','voc','pm25','co','temperature','humidity'].map(key=>({key,value:key==='temperature'?-1:0,unit:'index',observedAt:at}))}]};
test('cloud records survive readback, retain zero, deduplicate retries and keep IDs out of browser history',async()=>{
  const db=database(),h=new CloudHistory(db);
  assert.equal(await h.record(sample),6);assert.equal(await h.record(sample),0);
  const result=await h.query({metric:'voc',to:at});assert.equal(result.records,1);assert.equal(result.rows[0].value,0);assert.ok(!JSON.stringify(result).includes('private-id'));
  assert.equal((await h.status()).attempts,1);
  await assert.rejects(h.query({metric:"voc' OR 1=1"}),RangeError);
  await assert.rejects(h.query({before:'-1'}),RangeError);
  db.sql.close();
});
test('failed collections preserve latest readings and are recorded as unavailable',async()=>{
  const db=database(),h=new CloudHistory(db);await h.record(sample);
  await h.record({connected:true,fetchedAt:'2026-10-12T08:30:00Z',monitors:[],error:'Failure'});
  assert.equal((await h.state('latest')).fetchedAt,at);assert.equal((await h.status()).lastStatus,'unavailable');db.sql.close();
});
test('three monitors keep separate histories and a failed device cannot overwrite another',async()=>{
  const db=database(),h=new CloudHistory(db);await h.record(sample);
  const next='2026-10-12T08:10:00.000Z';
  const monitors=[0,1,2].map(n=>({...sample.monitors[0],id:n===0?'private-id':`private-new-${n}`,name:`Room ${n+1}`,
    readings:sample.monitors[0].readings.map(r=>({...r,value:r.key==='voc'?n*20:r.value,observedAt:next}))}));
  assert.equal(await h.record({connected:true,fetchedAt:next,monitors}),18);
  assert.equal(await h.record({connected:true,fetchedAt:next,monitors}),0);
  const history=await h.query({metric:'voc',to:next});
  assert.equal(history.records,4);assert.equal(history.series.length,3);
  assert.equal((await h.state('latest')).monitors.length,3);
  assert.equal((await h.status()).measurements,24);
  assert.equal(db.sql.prepare('SELECT count(DISTINCT monitor_id) AS n FROM measurements').get().n,3);
  assert.ok(!JSON.stringify(history).includes('private-new'));
  const partial=monitors.map((m,n)=>n===1?{...m,readings:[],error:'Unavailable'}:m);
  await h.record({connected:true,fetchedAt:'2026-10-12T08:11:00.000Z',monitors:partial});
  assert.equal((await h.status()).lastStatus,'partial');
  assert.equal((await h.query({metric:'voc',to:next})).records,4);
  assert.equal((await h.state('latest')).monitors[2].readings.find(r=>r.key==='voc').value,40);
  db.sql.close();
});
test('invalid batches are rejected without partial writes; missing sample times deduplicate on retry',async()=>{
  const db=database(),h=new CloudHistory(db);
  const row={monitor_id:'x',monitor:'room',metric:'voc',value:1,unit:'index',observed_at:null,fetched_at:at,quality:'time_unknown'};
  await assert.rejects(h.import('measurements',[row,{...row,value:Infinity}]),RangeError);
  assert.equal((await h.status()).measurements,0);await h.import('measurements',[row]);await h.import('measurements',[row]);assert.equal((await h.status()).measurements,1);db.sql.close();
});
test('session envelope is authenticated encryption and rejects tampering or a wrong key',()=>{
  const key=randomBytes(32).toString('base64'),session={cookie:'private-cookie',savedAt:1},sealed=sealSession(session,key);
  assert.ok(!JSON.stringify(sealed).includes('private-cookie'));assert.deepEqual(openSession(sealed,key),session);
  assert.throws(()=>openSession(sealed,randomBytes(32).toString('base64')));
  assert.throws(()=>openSession({...sealed,ciphertext:'AAAA'+sealed.ciphertext.slice(4)},key));
});
test('cloud credentials are restricted to the private Site origin and redirects are rejected',async()=>{
  assert.throws(()=>siteClient({siteUrl:'https://evil.test',siteBearer:'secret',collectorToken:'secret'}));
  let options;const call=siteClient({siteUrl:'https://home.test.chatgpt.site',siteBearer:'secret',collectorToken:'writer'},async(url,opts)=>{options=opts;return Response.json({saved:true});});
  assert.deepEqual(await call('/api/collector',{}),{saved:true});assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer writer');
});
