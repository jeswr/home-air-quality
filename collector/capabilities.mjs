const scalarValue = value => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean' || value === null) return value;
  if (typeof value === 'string' && ['ON', 'OFF', 'OK', 'CONNECTED', 'DISCONNECTED', 'GOOD', 'MODERATE', 'POOR'].includes(value)) return value;
  if (value && typeof value === 'object') {
    const inner = scalarValue(value.value);
    if (typeof inner !== 'object' || inner === null) {
      return { value: inner, ...(['CELSIUS', 'FAHRENHEIT', 'KELVIN'].includes(value.scale) ? { scale: value.scale } : {}) };
    }
  }
  return { omitted: true, kind: typeof value };
};

// Keep capability identifiers and numeric values, excluding device/account IDs
// and arbitrary string values that could contain personal information.
export function capabilitiesFrom(payload, id) {
  const state = payload?.deviceStates?.find(item => item.entity?.entityId === id || item.entityId === id)
    ?? (payload?.deviceStates?.length === 1 ? payload.deviceStates[0] : undefined);
  if (payload?.errors?.length || state?.error || !Array.isArray(state?.capabilityStates)) {
    throw new Error('Amazon could not return monitor capabilities.');
  }
  return state.capabilityStates.map(raw => {
    let item;
    try { item = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    if (!item || typeof item !== 'object') return null;
    const result = { value: scalarValue(item.value) };
    for (const field of ['namespace', 'name', 'instance']) {
      if (['string', 'number'].includes(typeof item[field])) result[field] = item[field];
    }
    if (typeof item.timeOfSample === 'string' && Number.isFinite(Date.parse(item.timeOfSample))) result.timeOfSample = item.timeOfSample;
    if (typeof item.uncertaintyInMilliseconds === 'number' && Number.isFinite(item.uncertaintyInMilliseconds)) {
      result.uncertaintyInMilliseconds = item.uncertaintyInMilliseconds;
    }
    return result;
  }).filter(Boolean);
}

export function declaredCapabilitiesFrom(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(item => item && typeof item === 'object').map(item => {
    const resources = item.capabilityResources || item.resources;
    const range = item.configuration?.supportedRange;
    return {
      interface: item.interface || item.interfaceName || item.name || null,
      instance: item.instance ?? null,
      labels: (resources?.friendlyNames || []).map(name => name.value?.text || name.value?.assetId).filter(value => typeof value === 'string'),
      unitOfMeasure: typeof item.configuration?.unitOfMeasure === 'string' ? item.configuration.unitOfMeasure : null,
      range: range ? Object.fromEntries(['minimumValue', 'maximumValue', 'precision']
        .filter(key => typeof range[key] === 'number' && Number.isFinite(range[key])).map(key => [key, range[key]])) : null,
      retrievable: item.properties?.retrievable === true,
      readOnly: item.properties?.readOnly === true
    };
  });
}
