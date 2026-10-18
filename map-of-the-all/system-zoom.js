/**
 * One-way semantic dolly boundary: a deliberate inward camera zoom may enter
 * the nearby stellar-system tier, but orbiting, panning and editing never do.
 * Positions are display units only, not distances or physical ephemerides.
 */
export const SYSTEM_ZOOM_RADIUS=17;
export function findSystemZoomTarget({viewKind,zooming,blocked,candidates=[],selectedId=null}){
  if(viewKind!=='galaxy'||!zooming||blocked)return null;
  const eligible=candidates.filter(c=>c.kind==='system'&&c.visible!==false&&
    Number.isFinite(c.distance)&&c.distance<SYSTEM_ZOOM_RADIUS&&
    Number.isFinite(c.screenX)&&Number.isFinite(c.screenY)&&
    Math.abs(c.screenX)<.88&&Math.abs(c.screenY)<.88);
  eligible.sort((a,b)=>{
    if((a.id===selectedId)!==(b.id===selectedId))return a.id===selectedId?-1:1;
    return a.distance-b.distance;
  });
  return eligible[0]?.id||null;
}
export function closePlanetCameraDistance(nodeSize){
  const radius=1.2+(Number.isFinite(nodeSize)?Math.max(.1,nodeSize):1);
  return Math.max(6.5,radius*3.5);
}
