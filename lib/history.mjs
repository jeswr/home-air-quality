const metrics = new Set(['iaq','voc','pm25','pm10','co','temperature','humidity']);
const required = ['iaq','voc','pm25','co','temperature','humidity'];
export const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function validateRow(row) {
  if (!row || !metrics.has(row.metric) || !Number.isFinite(row.value) || (row.metric !== 'temperature' && row.value < 0)
    || (['iaq','humidity'].includes(row.metric) && row.value > 100) || !iso(row.fetched_at)
    || typeof row.monitor_id !== 'string' || !row.monitor_id || row.monitor_id.length > 256
    || typeof row.monitor !== 'string' || row.monitor.length > 256 || typeof row.unit !== 'string' || row.unit.length > 64
    || (row.observed_at !== null && !iso(row.observed_at))
    || !['fresh','stale','time_unknown','future_time'].includes(row.quality)) throw new RangeError('Invalid sensor reading.');
  return row;
}
export function rowsFrom(data) {
  const fetched = iso(data?.fetchedAt); if (!fetched || !Array.isArray(data.monitors) || data.monitors.length > 20) throw new RangeError('Invalid collection.');
  const rows = []; let incomplete = Boolean(data.error);
  for (const monitor of data.monitors) {
    if (monitor.error) { incomplete = true; continue; }
    if (!Array.isArray(monitor.readings) || monitor.readings.length > 20) throw new RangeError('Invalid readings.');
    const present = new Set();
    for (const reading of monitor.readings) {
      const at = iso(reading.observedAt), age = at ? Date.parse(fetched) - Date.parse(at) : null;
      const quality = age === null ? 'time_unknown' : age < -60000 ? 'future_time' : age > 300000 ? 'stale' : 'fresh';
      rows.push(validateRow({monitor_id:monitor.id,monitor:monitor.name || 'Air quality monitor',metric:reading.key,value:reading.value,
        unit:reading.unit || '',observed_at:at,fetched_at:fetched,quality}));
      present.add(reading.key); if (quality !== 'fresh') incomplete = true;
    }
    if (required.some(key => !present.has(key))) incomplete = true;
  }
  return {rows, status:!data.connected ? 'disconnected' : !rows.length ? 'unavailable' : incomplete ? 'partial' : 'ok', fetched};
}
export class CloudHistory {
  constructor(db) { this.db = db; }
  stmt(sql, ...values) { return this.db.prepare(sql).bind(...values); }
  async all(sql, ...values) { return (await this.stmt(sql,...values).all()).results; }
  async first(sql, ...values) { return this.stmt(sql,...values).first(); }
  async state(key) { const row = await this.first('SELECT value FROM state WHERE key = ?',key); return row ? JSON.parse(row.value) : null; }
  setState(key,value) { return this.stmt('INSERT INTO state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,JSON.stringify(value)); }
  insertReading(row) {
    validateRow(row);
    // COALESCE prevents repeated missing-timestamp samples from accumulating.
    return this.stmt(`INSERT OR IGNORE INTO measurements(monitor_id,monitor,metric,value,unit,observed_at,fetched_at,quality)
      SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM measurements WHERE monitor_id=? AND metric=? AND observed_at IS NULL AND fetched_at=?)`,
      row.monitor_id,row.monitor,row.metric,row.value,row.unit,row.observed_at,row.fetched_at,row.quality,row.monitor_id,row.metric,row.fetched_at);
  }
  async record(data) {
    const {rows,status,fetched} = rowsFrom(data);
    const statements = rows.map(row=>this.insertReading(row));
    for (const monitor of data.monitors) {
      for (const c of (monitor.capabilities || []).slice(0,100)) {
        if (!c.namespace || !c.name || c.value?.omitted) continue;
        statements.push(this.stmt(`INSERT OR IGNORE INTO capability_samples(monitor_id,monitor,namespace,property,instance,value_json,observed_at,fetched_at,uncertainty_ms) VALUES (?,?,?,?,?,?,?,?,?)`,
          monitor.id,monitor.name,String(c.namespace),String(c.name),String(c.instance ?? ''),JSON.stringify(c.value),iso(c.timeOfSample),fetched,Number.isFinite(c.uncertaintyInMilliseconds)?c.uncertaintyInMilliseconds:null));
      }
    }
    statements.push(this.stmt(`INSERT OR IGNORE INTO attempts(fetched_at,status,measurements_added) SELECT ?,?,count(*) FROM measurements WHERE fetched_at=?`,fetched,status,fetched));
    const previous = await this.state('latest');
    if (rows.length && (!previous?.fetchedAt || fetched >= previous.fetchedAt)) {
      // Only sensor fields reach the dashboard. The encrypted session has its own endpoint.
      statements.push(this.setState('latest',{connected:true,fetchedAt:fetched,monitors:data.monitors.map(m=>({name:m.name,readings:m.readings,error:m.error}))}));
    }
    const result = await this.db.batch(statements);
    return result.slice(0,rows.length).reduce((n,r)=>n+(r.meta?.changes || 0),0);
  }
  async import(kind, rows) {
    if (!Array.isArray(rows) || rows.length > 200) throw new RangeError('Use batches of at most 200 rows.');
    let statements;
    if (kind === 'measurements') statements = rows.map(row=>this.insertReading(row));
    else if (kind === 'attempts') statements = rows.map(r=>{
      if (!iso(r.fetched_at) || !['ok','partial','unavailable','disconnected'].includes(r.status) || !Number.isSafeInteger(r.measurements_added)) throw new RangeError('Invalid collection log.');
      return this.stmt('INSERT OR IGNORE INTO attempts(fetched_at,status,measurements_added) VALUES (?,?,?)',r.fetched_at,r.status,r.measurements_added);
    });
    else if (kind === 'capabilities') statements = rows.map(r=>{
      if (!iso(r.fetched_at) || (r.observed_at!==null && !iso(r.observed_at)) || typeof r.value_json!=='string' || r.value_json.length>4096) throw new RangeError('Invalid source value.');
      return this.stmt('INSERT OR IGNORE INTO capability_samples(monitor_id,monitor,namespace,property,instance,value_json,observed_at,fetched_at,uncertainty_ms) VALUES (?,?,?,?,?,?,?,?,?)',
        r.monitor_id,r.monitor,r.namespace,r.property,r.instance,r.value_json,r.observed_at,r.fetched_at,r.uncertainty_ms);
    });
    else throw new RangeError('Invalid import type.');
    return statements.length ? this.db.batch(statements) : [];
  }
  async status() {
    const first = await this.first('SELECT fetched_at FROM attempts ORDER BY fetched_at LIMIT 1');
    const last = await this.first('SELECT fetched_at,status FROM attempts ORDER BY fetched_at DESC LIMIT 1');
    const count = await this.first('SELECT (SELECT count(*) FROM attempts) AS attempts,(SELECT count(*) FROM measurements) AS measurements,(SELECT count(*) FROM capability_samples) AS capabilitySamples');
    const success = await this.first("SELECT fetched_at FROM attempts WHERE status='ok' ORDER BY fetched_at DESC LIMIT 1");
    const overdue = !last || Date.now()-Date.parse(last.fetched_at)>25*60000;
    return {...count,startedAt:first?.fetched_at || null,lastAttemptAt:last?.fetched_at || null,lastStatus:last?.status || null,
      lastSuccessAt:success?.fetched_at || null,logging:!overdue && ['ok','partial'].includes(last?.status),intervalMinutes:10};
  }
  async query({metric='voc',from,to=new Date().toISOString(),before}={}) {
    if (!metrics.has(metric)) throw new RangeError('Choose a valid sensor.');
    const end=iso(to), start=from===undefined ? (await this.first('SELECT min(coalesce(observed_at,fetched_at)) AS time FROM measurements WHERE metric=?',metric)).time || end : iso(from);
    const cursor=before===undefined ? Number.MAX_SAFE_INTEGER : Number(before);
    if (!start || !end || Date.parse(start)>Date.parse(end) || !Number.isSafeInteger(cursor) || cursor<1) throw new RangeError('Invalid history range or cursor.');
    const bucketSeconds=Math.max(60,Math.ceil((Date.parse(end)-Date.parse(start))/1000/500));
    const counts=await this.first(`SELECT count(*) AS records,sum(CASE WHEN observed_at IS NULL THEN 1 ELSE 0 END) AS unknownTimes FROM measurements WHERE metric=? AND coalesce(observed_at,fetched_at) BETWEEN ? AND ?`,metric,start,end);
    const grouped=await this.all(`SELECT monitor_id,max(monitor) AS monitor,unit,CAST((unixepoch(observed_at)-unixepoch(?))/? AS INTEGER) AS bucket,min(observed_at) AS first_at,max(observed_at) AS last_at,avg(value) AS value,min(value) AS minimum,max(value) AS maximum,count(*) AS count FROM measurements WHERE metric=? AND observed_at BETWEEN ? AND ? AND quality='fresh' GROUP BY monitor_id,unit,bucket ORDER BY monitor_id,unit,bucket`,start,bucketSeconds,metric,start,end);
    const series=[]; let previous;
    for (const p of grouped) {
      const key=JSON.stringify([p.monitor_id,p.unit]); if(key!==previous) { series.push({monitor:p.monitor,unit:p.unit,points:[]}); previous=key; }
      series.at(-1).points.push({at:new Date((Date.parse(p.first_at)+Date.parse(p.last_at))/2).toISOString(),firstAt:p.first_at,lastAt:p.last_at,value:p.value,minimum:p.minimum,maximum:p.maximum,count:p.count});
    }
    const rows=await this.all(`SELECT id,monitor,value,unit,observed_at AS observedAt,fetched_at AS fetchedAt,quality FROM measurements WHERE metric=? AND coalesce(observed_at,fetched_at) BETWEEN ? AND ? AND id<? ORDER BY id DESC LIMIT 101`,metric,start,end,cursor);
    const more=rows.length>100;if(more)rows.pop();
    return {metric,from:start,to:end,bucketSeconds,...counts,unknownTimes:counts.unknownTimes || 0,series,rows,nextCursor:more?rows.at(-1).id:null};
  }
  csv(kind) {
    const table=kind==='attempts'?'attempts':kind==='capabilities'?'capability_samples':'measurements';
    const columns=table==='attempts'?['fetched_at','status','measurements_added']:table==='capability_samples'?['observed_at','fetched_at','monitor','namespace','property','instance','value_json','uncertainty_ms']:['observed_at','fetched_at','monitor','metric','value','unit','quality'];
    const encoder=new TextEncoder(), self=this;
    const line=values=>values.map(v=>{let s=String(v??'');if(typeof v==='string' && /^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')+'\r\n';
    let cursor=0, upper, header=false;
    return new ReadableStream({async pull(controller) {
      try {
        if(!header) {upper=(await self.first(`SELECT max(id) AS id FROM ${table}`)).id || 0;controller.enqueue(encoder.encode(line(columns)));header=true;return;}
        const rows=await self.all(`SELECT id,${columns.join(',')} FROM ${table} WHERE id>? AND id<=? ORDER BY id LIMIT 500`,cursor,upper);
        if(!rows.length) {controller.close();return;}
        controller.enqueue(encoder.encode(rows.map(r=>line(columns.map(c=>r[c]))).join('')));cursor=rows.at(-1).id;
      } catch {controller.error(new Error('CSV export failed.'));}
    }});
  }
}
