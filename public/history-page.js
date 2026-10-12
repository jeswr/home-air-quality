import { segmentsFor, domainFor } from './chart-model.mjs';
const sensor = document.querySelector('#sensor'), range = document.querySelector('#range');
const message = document.querySelector('#history-message'), older = document.querySelector('#older');
const rows = document.querySelector('#history-rows'), chart = document.querySelector('#history-chart');
const refresh = document.querySelector('#refresh-history');
const dates = value => value ? new Date(value).toLocaleString('en-GB') : 'Unknown';
const number = value => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 4 }).format(value);
const quality = {fresh:'Valid',stale:'Stale when collected',time_unknown:'Unknown measurement time',future_time:'Measurement time in future'};
const colours = ['#205a43','#975422','#375b91','#775180'];
const initialFilters = new URLSearchParams(location.search);
for (const [control, key] of [[sensor,'metric'],[range,'range']]) {
  const value = initialFilters.get(key);
  if ([...control.options].some(option=>option.value===value)) control.value = value;
}
let query, nextCursor, loading = false, generation = 0, browsingOlder = false;
function node(tag, text, className) {
  const el = document.createElement(tag); if (text !== undefined) el.textContent = text;
  if (className) el.className = className; return el;
}
function svgNode(tag, attributes, text) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key,value] of Object.entries(attributes)) el.setAttribute(key,String(value));
  if (text !== undefined) el.textContent = text; return el;
}
function renderChart(data, label) {
  chart.replaceChildren();
  const points = data.series.flatMap(series => series.points);
  if (!points.length) { chart.append(node('p','No readings with reliable measurement times in this range.','chart-empty')); return; }
  const [low,high] = domainFor(points);
  const times = points.map(point => Date.parse(point.at));
  let first = Math.min(...times), last = Math.max(...times);
  if (first === last) { first -= 30000; last += 30000; }
  const x = time => 65 + (Date.parse(time) - first) / (last - first) * 645;
  const y = value => 255 - (value - low) / (high - low) * 220;
  const svg = svgNode('svg',{viewBox:'0 0 740 310',role:'img','aria-label':`${label} over time. The table below contains the saved values.`});
  for (let tick = 0; tick <= 4; tick++) {
    const value = low + (high - low) * tick / 4, yy = y(value);
    svg.append(svgNode('line',{x1:65,x2:710,y1:yy,y2:yy,stroke:'#e2e8df'}),
      svgNode('text',{x:55,y:yy+4,'text-anchor':'end',fill:'#61766b','font-size':12},number(value)));
  }
  for (let tick = 0; tick <= 2; tick++) {
    const at = first + (last - first) * tick / 2;
    const text = new Date(at).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    svg.append(svgNode('text',{x:65+645*tick/2,y:285,'text-anchor':tick===0?'start':tick===2?'end':'middle',fill:'#61766b','font-size':12},text));
  }
  const legend = node('ul',undefined,'chart-legend');
  data.series.forEach((series,index) => {
    const colour = colours[index % colours.length];
    legend.append(node('li',`${series.monitor} · ${series.unit || 'unit not provided'}`));
    for (const segment of segmentsFor(series.points,data.bucketSeconds)) {
      const band = [...segment.map(p=>`${x(p.at)},${y(p.maximum)}`),...segment.toReversed().map(p=>`${x(p.at)},${y(p.minimum)}`)].join(' ');
      svg.append(svgNode('polygon',{points:band,fill:colour,'fill-opacity':0.15}));
      svg.append(svgNode('polyline',{points:segment.map(p=>`${x(p.at)},${y(p.value)}`).join(' '),fill:'none',stroke:colour,'stroke-width':2.5,'stroke-linejoin':'round'}));
      for (const point of segment) {
        const dot = svgNode('circle',{cx:x(point.at),cy:y(point.value),r:3,fill:colour});
        dot.append(svgNode('title',{},`${series.monitor}: ${number(point.value)} ${series.unit}, ${dates(point.at)}${point.count>1?` · ${point.count} readings, range ${number(point.minimum)}–${number(point.maximum)}`:''}`));
        svg.append(dot);
      }
    }
  });
  chart.append(svg,legend);
}
function appendRows(data) {
  for (const reading of data.rows) {
    const tr = node('tr');
    for (const text of [dates(reading.observedAt),`${String(reading.value)} ${reading.unit}`,reading.monitor,dates(reading.fetchedAt),quality[reading.quality] || reading.quality]) tr.append(node('td',text));
    rows.append(tr);
  }
  nextCursor = data.nextCursor; older.hidden = !nextCursor;
}
async function load(append = false) {
  if (append && loading) return;
  const run = ++generation; loading = true; older.disabled = true; refresh.disabled = true;
  if (!append) {
    browsingOlder = false; nextCursor = null; older.hidden = true;
    history.replaceState(null,'','/history?' + new URLSearchParams({metric:sensor.value,range:range.value}));
    query = new URLSearchParams({metric:sensor.value,to:new Date().toISOString()});
    if (range.value !== 'all') query.set('from',new Date(Date.parse(query.get('to'))-Number(range.value)*3600000).toISOString());
    message.textContent = 'Loading saved readings…';
  }
  const params = new URLSearchParams(query); if (append) params.set('before',nextCursor);
  try {
    const response = await fetch('/api/history?' + params);
    if (!response.ok) throw new Error();
    const data = await response.json(); if (run !== generation) return;
    if (!append) {
      query.set('from',data.from);
      rows.replaceChildren();
      const label = sensor.selectedOptions[0].textContent;
      document.querySelector('#chart-heading').textContent = label;
      document.querySelector('#table-caption').textContent = `${label} readings`;
      message.textContent = data.records ? `${data.records.toLocaleString('en-GB')} saved readings in this range.` : 'No saved readings in this range yet. Try All saved history.';
      const measured = data.series.flatMap(series=>series.points);
      document.querySelector('#chart-summary').textContent = measured.length ? `${dates(measured.reduce((a,p)=>p.firstAt<a?p.firstAt:a,measured[0].firstAt))} to ${dates(measured.reduce((a,p)=>p.lastAt>a?p.lastAt:a,measured[0].lastAt))}` : '';
      const averaged = measured.some(point=>point.count>1);
      document.querySelector('#chart-note').textContent = `${averaged?`Chart shows averages in ${Math.round(data.bucketSeconds/60*10)/10}-minute groups; shading preserves each group’s minimum and maximum. `:''}Gaps indicate missing data. Readings with unknown or unreliable measurement times appear only in the table.`;
      renderChart(data,label);
    }
    appendRows(data);
    if (append) {
      browsingOlder = true;
      message.textContent = `${rows.children.length.toLocaleString('en-GB')} of ${data.records.toLocaleString('en-GB')} saved readings shown in the table. Automatic refresh is paused while browsing older readings.`;
    }
  } catch {
    if (run === generation) message.textContent = 'Could not load history. Refresh or check your internet connection.';
  } finally {
    if (run === generation) { loading = false; older.disabled = false; refresh.disabled = false; }
  }
}
async function loggingStatus() {
  try {
    const response = await fetch('/api/history/status'); if (!response.ok) throw new Error();
    const data = await response.json();
    document.querySelector('#logging-summary').textContent = !data.logging ? 'Cloud collection needs attention' : data.startedAt ? `Logging since ${dates(data.startedAt)}` : 'Logging is starting…';
  } catch { document.querySelector('#logging-summary').textContent = 'Logging status unavailable'; }
}
document.querySelector('#filters').addEventListener('submit',event=>{event.preventDefault();void load();void loggingStatus();});
sensor.addEventListener('change',()=>void load()); range.addEventListener('change',()=>void load());
older.addEventListener('click',()=>void load(true));
setInterval(()=>{if (!document.hidden && !loading && !browsingOlder) void load();void loggingStatus();},60000);
void load(); void loggingStatus();
