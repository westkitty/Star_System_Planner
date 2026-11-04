/**
 * Reversible, editor-guarded scale navigation. All distances and scale factors
 * are visual display coordinates, never astronomical measurements or canon.
 */
export const GALAXY_ZOOM_RADIUS=57;
export const SYSTEM_ZOOM_RADIUS=17;
export const PLANET_ZOOM_RADIUS=12;
export const SYSTEM_EXIT_RADIUS=230;
export const GALAXY_EXIT_RADIUS=290;

const eligible=(c,kind,radius)=>c.kind===kind&&c.visible!==false&&
  Number.isFinite(c.distance)&&c.distance<radius&&
  Number.isFinite(c.screenX)&&Number.isFinite(c.screenY)&&
  Math.abs(c.screenX)<.88&&Math.abs(c.screenY)<.88;

function nearestTarget({viewKind,expected,zooming,blocked,candidates=[],selectedId=null,radius,kind}){
  if(viewKind!==expected||!zooming||blocked)return null;
  const matches=candidates.filter(c=>eligible(c,kind,radius));
  matches.sort((a,b)=>{
    if((a.id===selectedId)!==(b.id===selectedId))return a.id===selectedId?-1:1;
    return a.distance-b.distance;
  });
  return matches[0]?.id||null;
}
export function findGalaxyZoomTarget(options){
  return nearestTarget({...options,expected:'all',radius:GALAXY_ZOOM_RADIUS,kind:'galaxy'});
}
export function findSystemZoomTarget(options){
  return nearestTarget({...options,expected:'galaxy',radius:SYSTEM_ZOOM_RADIUS,kind:'system'});
}
export function findPlanetZoomTarget(options){
  return nearestTarget({...options,expected:'system',radius:PLANET_ZOOM_RADIUS,kind:'planet'});
}
export function shouldAscendZoom({viewKind,zoomingOut,blocked,distance}){
  if(!zoomingOut||blocked||!Number.isFinite(distance))return false;
  return (viewKind==='system'&&distance>=SYSTEM_EXIT_RADIUS)||
    (viewKind==='galaxy'&&distance>=GALAXY_EXIT_RADIUS);
}
/** The child representation begins where the parent marker already appears. */
export function tierEntryScale(fromKind,toKind,nodeSize=1){
  if(fromKind==='galaxy'&&toKind==='system')return .25;
  if(fromKind==='system'&&toKind==='galaxy')return 4;
  const size=Number.isFinite(nodeSize)?Math.max(.1,nodeSize):1;
  const galaxyScale=Math.max(.16,Math.min(.75,size*22/68));
  if(fromKind==='all'&&toKind==='galaxy')return galaxyScale;
  if(fromKind==='galaxy'&&toKind==='all')return 1/galaxyScale;
  return null;
}
export function smoothZoomProgress(t){
  const x=Math.max(0,Math.min(1,Number.isFinite(t)?t:0));
  return x*x*(3-2*x);
}
export function closePlanetCameraDistance(nodeSize){
  const radius=1.2+(Number.isFinite(nodeSize)?Math.max(.1,nodeSize):1);
  return Math.max(6.5,radius*3.5);
}
