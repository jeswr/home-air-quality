export function segmentsFor(points, bucketSeconds) {
  const segments = [];
  for (const point of points) {
    const segment = segments.at(-1);
    const previous = segment?.at(-1);
    // Do not draw a line through missing collections, even on wider ranges.
    if (!previous || Date.parse(point.firstAt) - Date.parse(previous.lastAt) > Math.max(25 * 60000, bucketSeconds * 2000)) {
      segments.push([point]);
    } else segment.push(point);
  }
  return segments;
}

export function domainFor(points) {
  const lows = points.map(point => point.minimum), highs = points.map(point => point.maximum);
  const low = Math.min(...lows), high = Math.max(...highs);
  const padding = Math.max((high - low) * 0.12, Math.abs(high) * 0.02, 0.5);
  return [low >= 0 ? Math.max(0, low - padding) : low - padding, high + padding];
}
