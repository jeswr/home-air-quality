// Read-only endpoints used by alexa-remote and alexa-exporter; no public API exists.
export const endpointQuery = `query Endpoints { endpoints { items {
  endpointId friendlyName displayCategories { primary { value } }
  legacyAppliance { applianceId friendlyName modelName capabilities }
} } }`;

const regions = new Set(['amazon.com', 'amazon.co.uk', 'amazon.com.au', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.ca', 'amazon.co.jp', 'amazon.in', 'amazon.com.br', 'amazon.com.mx']);
export function sessionRegion(session) {
  const region = session?.amazonPage || 'amazon.co.uk';
  if (!regions.has(region)) throw new Error('Amazon returned an unsupported account region.');
  return region;
}
export function websiteOrigin(value, region) {
  const url = new URL(value);
  if (!regions.has(region) || url.protocol !== 'https:' || url.port || url.username || url.password ||
      !url.hostname.endsWith('.' + region) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Amazon returned an unexpected regional service address.');
  }
  return url.origin;
}

export function monitorsFrom(payload) {
  if (payload?.errors?.some(e => /unauthenticated/i.test(e.message || ''))) {
    throw new Error('Amazon rejected the device-list authentication. Check the account region.');
  }
  const items = payload?.data?.endpoints?.items;
  if (!Array.isArray(items)) throw new Error('Amazon returned an unexpected device list.');
  const found = new Map();
  for (const item of items) {
    const legacy = item.legacyAppliance ?? {};
    const description = JSON.stringify([item.displayCategories, legacy.modelName, legacy.capabilities]);
    if (!/AIR_QUALITY_MONITOR|Alexa\.AirQuality|AIAQM|Smart Air Quality/i.test(description)) continue;
    if (legacy.applianceId) found.set(legacy.applianceId, {
      id: legacy.applianceId, name: item.friendlyName || legacy.friendlyName || 'Air quality monitor'
    });
  }
  return [...found.values()];
}

const metrics = {
  '3': ['temperature', 'Temperature', '°C'],
  '4': ['humidity', 'Humidity', '%'],
  '5': ['voc', 'VOC index', 'index'],
  '6': ['pm25', 'PM2.5', 'µg/m³'],
  // Live endpoint metadata labels instance 7 as PM10 but supplies no unit.
  '7': ['pm10', 'PM10', 'unit not provided'],
  '8': ['co', 'Carbon monoxide', 'ppm'],
  '9': ['iaq', 'Air quality score', '/100']
};

export function readingsFrom(payload, id) {
  const state = payload?.deviceStates?.find(s => s.entity?.entityId === id || s.entityId === id)
    ?? (payload?.deviceStates?.length === 1 ? payload.deviceStates[0] : undefined);
  if (payload?.errors?.length || state?.error || !Array.isArray(state?.capabilityStates)) {
    throw new Error('Amazon could not return readings. Check that the monitor is online.');
  }
  const readings = [];
  for (const raw of state.capabilityStates) {
    let cap;
    try { cap = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
    const meta = cap?.namespace === 'Alexa.TemperatureSensor' && cap?.name === 'temperature'
      ? metrics['3'] : metrics[String(cap?.instance)];
    if (!meta) continue;
    let value = typeof cap.value === 'object' && cap.value !== null ? cap.value.value : cap.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    let unit = meta[2];
    if (meta[0] === 'temperature' && cap.value?.scale === 'FAHRENHEIT') {
      value = (value - 32) * 5 / 9;
    }
    readings.push({ key: meta[0], label: meta[1], value, unit, observedAt: cap.timeOfSample || null });
  }
  if (!readings.length) throw new Error('No recognised sensor readings were returned by Amazon.');
  return readings;
}
