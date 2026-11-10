import { createHash } from 'node:crypto';
import pinnedRooms from '../monitor-labels.json' with { type: 'json' };

// Room names were matched to Alexa group membership, then pinned by a one-way
// digest of the unchanged device identity. No raw Amazon IDs are published.
const identity = id => createHash('sha256').update(String(id)).digest('hex');
export function monitorName(id, fallback, rooms = pinnedRooms) {
  return rooms[identity(id)]?.name || fallback;
}
export function labelMonitors(monitors, rooms = pinnedRooms) {
  const order = id => rooms[identity(id)]?.order ?? Number.MAX_SAFE_INTEGER;
  return monitors.map(m => ({...m, name:monitorName(m.id,m.name,rooms)}))
    .sort((a,b) => order(a.id)-order(b.id) || a.name.localeCompare(b.name) || identity(a.id).localeCompare(identity(b.id)));
}
