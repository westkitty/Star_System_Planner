/** Pure, non-canonical spatial editing rules. No Three.js or DOM dependencies. */
export const EDIT_MODES = Object.freeze(['orbit', 'move', 'route', 'label']);
export const DISPLAY_LENSES = Object.freeze(['survey', 'signal', 'cartographer']);
export const MAX_DRAFT_COORDINATE = 10000;
export const MAX_LABEL_OFFSET = 0.3; // normalized viewport fractions

export function validLabelOffset(offset) {
  return Array.isArray(offset) && offset.length === 2 &&
    offset.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_LABEL_OFFSET);
}
export function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }
export function snapped(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step < 0) throw new Error('Invalid draft snap input');
  return step ? Math.round(value / step) * step : value;
}
/** Each gesture commits one coordinate change; intermediate movement is preview-only. */
export function draftPosition(origin, delta, axis='xz', step=0) {
  if (!Array.isArray(origin) || origin.length !== 3 || !Array.isArray(delta) || delta.length !== 3 ||
      [...origin, ...delta].some(v => typeof v !== 'number' || !Number.isFinite(v)) ||
      !['xz','y'].includes(axis)) throw new Error('Invalid spatial gesture');
  const raw=axis==='y'?[origin[0],origin[1]+delta[1],origin[2]]:[origin[0]+delta[0],origin[1],origin[2]+delta[2]];
  return raw.map((v,i) => axis==='y'&&i!==1 || axis==='xz'&&i===1 ? v : clamp(snapped(v,step),-MAX_DRAFT_COORDINATE,MAX_DRAFT_COORDINATE));
}
/** All geometry in the atlas is a display hypothesis; these are UI offsets, not cosmic positions. */
export function moveLabelOffset(previous,dx,dy,width,height) {
  if (!validLabelOffset(previous)||[dx,dy,width,height].some(v=>!Number.isFinite(v))||width<=0||height<=0)throw new Error('Invalid label gesture');
  return [clamp(previous[0]+dx/width,-MAX_LABEL_OFFSET,MAX_LABEL_OFFSET),clamp(previous[1]+dy/height,-MAX_LABEL_OFFSET,MAX_LABEL_OFFSET)];
}
/** Never connect read-only source identities or physically imply routes from a topology edge. */
export function validateCorridor(state,sourceId,targetId) {
  if (!state||!Array.isArray(state.nodes)||!Array.isArray(state.routes))return 'No atlas draft available';
  const a=state.nodes.find(n=>n.id===sourceId),b=state.nodes.find(n=>n.id===targetId);
  if(!a||!b)return 'Select two visible draft nodes';
  if(a.id===b.id)return 'A corridor requires two different objects';
  if(a.status!=='draft'||b.status!=='draft')return 'Read-only source identities cannot be linked';
  if(a.kind!==b.kind||a.parentId!==b.parentId)return 'Corridors must connect the same tier and parent';
  if(!['galaxy','system','planet'].includes(a.kind))return 'The selected object tier is not routable';
  if(state.routes.some(r=>(r.from===sourceId&&r.to===targetId)||(r.from===targetId&&r.to===sourceId)))return 'A draft corridor already connects those objects';
  if(state.routes.length>=1000)return 'Atlas corridor limit reached';
  return null;
}
export function validMoveTarget(node,view) {
  if(!node||node.status!=='draft')return false;
  if(view?.kind==='all')return node.parentId===null && ['galaxy','annotation'].includes(node.kind);
  if(view?.kind==='galaxy')return node.parentId===view.id && ['system','annotation'].includes(node.kind);
  if(view?.kind==='system')return node.parentId===view.id && ['planet','annotation'].includes(node.kind);
  return false;
}
