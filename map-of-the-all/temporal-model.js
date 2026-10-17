/** Phase 6 — editable, provisional era snapshots; never a canonical event chronology. */
export const TEMPORAL_VERSION = 1;
export const ERA_IDS = Object.freeze(['war', 'locking', 'post']);
export const MAX_ERA_NOTE = 800;
const copy = value => JSON.parse(JSON.stringify(value));
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Store only editable cartography. Do not snapshot UI focus, camera, or global quality settings. */
export function captureEra(state) {
  return copy({nodes: state.nodes, routes: state.routes, regions: state.regions ?? [], layers: state.layers});
}
export function applyEra(state, snapshot) {
  const data = copy(snapshot);
  state.nodes = data.nodes;
  state.routes = data.routes;
  state.regions = data.regions;
  state.layers = data.layers;
  state.selected = null;
  return state;
}
export function ensureTimeline(state) {
  if (state.timeline !== undefined) return state.timeline;
  if (!ERA_IDS.includes(state.epoch)) throw new Error('Cannot initialize timeline with unknown era');
  const snapshot = captureEra(state);
  state.timeline = {
    version: TEMPORAL_VERSION,
    snapshots: Object.fromEntries(ERA_IDS.map(id => [id, copy(snapshot)])),
    notes: Object.fromEntries(ERA_IDS.map(id => [id, ''])),
  };
  return state.timeline;
}
export function syncEra(state) {
  const timeline = ensureTimeline(state);
  timeline.snapshots[state.epoch] = captureEra(state);
  return timeline;
}
/** One atomic, undoable replacement. No temporal interpolation or invented dates. */
export function switchEra(state, next) {
  if (!ERA_IDS.includes(next)) throw new Error('Unknown Starsilk era');
  if (next === state.epoch) return false;
  syncEra(state);
  applyEra(state, state.timeline.snapshots[next]);
  state.epoch = next;
  syncEra(state);
  return true;
}
export function cloneEra(state, from, into) {
  if (!ERA_IDS.includes(from) || !ERA_IDS.includes(into) || from === into)
    throw new Error('Choose two different known eras');
  syncEra(state);
  state.timeline.snapshots[into] = copy(state.timeline.snapshots[from]);
  return true;
}
export function writeEraNote(state, era, note) {
  if (!ERA_IDS.includes(era) || typeof note !== 'string' || note.length > MAX_ERA_NOTE)
    throw new Error('Invalid provisional era note');
  ensureTimeline(state).notes[era] = note;
}
const isRecord = x => !!x && typeof x === 'object' && !Array.isArray(x);
/** The caller supplies the existing comprehensive atlas validator, minus timeline recursion. */
export function validateTimeline(state, validateSnapshot) {
  if (state.timeline === undefined) return [];
  const t = state.timeline;
  if (!isRecord(t) || t.version !== TEMPORAL_VERSION || !isRecord(t.snapshots) || !isRecord(t.notes))
    return ['Invalid temporal snapshot manifest'];
  if (Object.keys(t.snapshots).length !== ERA_IDS.length || Object.keys(t.notes).length !== ERA_IDS.length ||
      ERA_IDS.some(id => !has(t.snapshots, id) || !has(t.notes, id) ||
        typeof t.notes[id] !== 'string' || t.notes[id].length > MAX_ERA_NOTE))
    return ['Invalid temporal era inventory'];
  const errors = [];
  for (const id of ERA_IDS) {
    const snap = t.snapshots[id];
    if (!isRecord(snap) || !Array.isArray(snap.nodes) || !Array.isArray(snap.routes) ||
        !Array.isArray(snap.regions) || !isRecord(snap.layers)) {
      errors.push('Malformed snapshot for ' + id); continue;
    }
    // Limits, parent relationships, route references and region geometry are
    // enforced by the same validator as the live draft state.
    const nested = validateSnapshot({...state, ...snap, epoch: id, timeline: undefined, selected: null});
    if (nested.length) errors.push(`Era ${id}: ${nested[0]}`);
  }
  if (!errors.length && JSON.stringify(t.snapshots[state.epoch]) !== JSON.stringify(captureEra(state)))
    errors.push('Active era differs from its stored snapshot');
  return errors;
}
export function sanitizeTimeline(state) {
  if (!state.timeline) return state;
  for (const id of ERA_IDS) for (const node of state.timeline.snapshots[id].nodes) {
    // JSON uploads must not gain the Dossier's source approval implicitly.
    node.status = 'draft'; node.sourceUrl = null;
  }
  return state;
}
const index = items => new Map(items.map(item => [item.id, item]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function compareCollection(oldItems, newItems, meaningfulEqual = same) {
  const prev=index(oldItems), next=index(newItems);
  const added=[], removed=[], modified=[];
  for (const [id, item] of next) {
    if (!prev.has(id)) added.push(item);
    else if (!meaningfulEqual(prev.get(id),item)) modified.push({before:prev.get(id),after:item});
  }
  for (const [id, item] of prev) if (!next.has(id)) removed.push(item);
  return {added, removed, modified};
}
/** The visual preview uses only delta identity and draft position, never distances. */
export function compareEras(from, to) {
  if (!from || !to) throw new Error('Two snapshots required');
  const nodes = compareCollection(from.nodes,to.nodes);
  const routes = compareCollection(from.routes,to.routes);
  const regions = compareCollection(from.regions,to.regions);
  const layers=[];
  for (const key of new Set([...Object.keys(from.layers),...Object.keys(to.layers)]))
    if(from.layers[key]!==to.layers[key])layers.push(key);
  const moved = nodes.modified.filter(({before,after})=>!same(before.position,after.position));
  const renamed = nodes.modified.filter(({before,after})=>before.name!==after.name);
  return {nodes,routes,regions,layers,moved,renamed,
    total: nodes.added.length + nodes.removed.length + nodes.modified.length +
      routes.added.length + routes.removed.length + routes.modified.length +
      regions.added.length + regions.removed.length + regions.modified.length + layers.length};
}
export function eraSummary(diff) {
  return [
    ['New objects',diff.nodes.added.length],['Removed objects',diff.nodes.removed.length],
    ['Edited objects',diff.nodes.modified.length],['Moved objects',diff.moved.length],
    ['New routes',diff.routes.added.length],['Removed routes',diff.routes.removed.length],
    ['Edited regions',diff.regions.added.length+diff.regions.removed.length+diff.regions.modified.length],
    ['Layer differences',diff.layers.length]
  ];
}
