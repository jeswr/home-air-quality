const status = document.querySelector('#status');
const monitors = document.querySelector('#monitors');
let loading = false;
const element = (tag, text, className) => {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
};
async function update() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch('/api/readings');
    if (!response.ok) throw new Error();
    const data = await response.json();
    const hasReadings = data.monitors?.some(m => m.readings.length);
    const outdated = data.fetchedAt && Date.now() - Date.parse(data.fetchedAt) > 65 * 60000;
    status.textContent = (outdated ? 'Collection overdue. Showing previous saved readings. ' : '') + (data.error || data.message || (hasReadings ? 'Latest saved readings · cloud collection every 30 minutes' : 'Connected to Amazon · waiting for sensor readings')); 
    document.querySelector('#empty').hidden = Boolean(hasReadings);
    monitors.replaceChildren();
    for (const monitor of data.monitors || []) {
      const section = element('section', '', 'monitor');
      section.append(element('h2', monitor.name));
      if (monitor.error) section.append(element('p', monitor.error, 'error'));
      const cards = element('div', '', 'cards');
      for (const reading of monitor.readings) {
        const card = element('article', '', 'card');
        card.append(element('h3', reading.label));
        const value = element('span', new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(reading.value), 'value');
        card.append(value, element('span', reading.unit, 'unit'));
        if (reading.observedAt) {
          const date = new Date(reading.observedAt);
          if (!Number.isNaN(date.getTime())) card.append(element('p', 'Measured ' + date.toLocaleString('en-GB'), 'sample'));
        }
        const historyLink = element('a', `View ${reading.label} history`, 'sample');
        historyLink.href = '/history?metric=' + encodeURIComponent(reading.key);
        card.append(historyLink);
        cards.append(card);
      }
      section.append(cards); monitors.append(section);
    }
    document.querySelector('#updated').textContent = data.fetchedAt ? 'Last fetched ' + new Date(data.fetchedAt).toLocaleTimeString('en-GB') : 'Waiting for connection';
    try {
      const historyResponse = await fetch('/api/history/status');
      if (!historyResponse.ok) throw new Error();
      const history = await historyResponse.json();
      document.querySelector('#history-status').textContent = !history.logging
        ? 'Cloud collection needs attention. Check the last collection status.'
        : history.startedAt
          ? `Logging since ${new Date(history.startedAt).toLocaleString('en-GB')} · ${history.measurements.toLocaleString('en-GB')} sensor measurements saved` + (history.lastStatus !== 'ok' ? ' · latest collection incomplete or unavailable' : '')
          : 'Logging is starting…';
    } catch { document.querySelector('#history-status').textContent = 'Logging status is unavailable.'; }
  } catch { status.textContent = 'The cloud dashboard is unavailable. Please try again.'; }
  finally { loading = false; }
}
setInterval(update, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
update();
