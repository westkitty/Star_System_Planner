/**
 * Strategic Studio: pure bounded editorial cartography.
 * No metric astronomy, faction authority, Three.js, DOM, or canonical coordinates.
 */
export const MAX_REGIONS = 48;
export const MAX_VERTICES = 24;
export const MAX_GROUP = 32;
export const DISPLAY_LIMIT = 10000;
const idPattern = /^[-a-zA-Z0-9_]{1,90}$/;
const hexPattern = /^#[0-9a-fA-F]{6}$/;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const pointValid = p => Array.isArray(p) && p.length === 2 && p.every(n => finite(n) && Math.abs(n) <= DISPLAY_LIMIT);
const coordsValid = p => Array.isArray(p) && p.length === 3 && p.every(n => finite(n) && Math.abs(n) <= DISPLAY_LIMIT);
const nodeById = (s,id) => s.nodes.find(n=>n.id===id);
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const within = (a,b,x) => Math.min(a,b)-1e-9<=x && x<=Math.max(a,b)+1e-9;
function intersects(a,b,c,d) {
  const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);
  if (p*q<0 && r*s<0) return true;
  if (Math.abs(p)<1e-10&&within(a[0],b[0],c[0])&&within(a[1],b[1],c[1])) return true;
  if (Math.abs(q)<1e-10&&within(a[0],b[0],d[0])&&within(a[1],b[1],d[1])) return true;
  if (Math.abs(r)<1e-10&&within(c[0],d[0],a[0])&&within(c[1],d[1],a[1])) return true;
  if (Math.abs(s)<1e-10&&within(c[0],d[0],b[0])&&within(c[1],d[1],b[1])) return true;
  return false;
}
export function polygonArea(points) {
  if (!Array.isArray(points) || points.length<3 || points.some(p=>!pointValid(p))) return 0;
  let sum=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];sum+=p[0]*q[1]-q[0]*p[1];}
  return Math.abs(sum)/2;
}
export function validatePolygon(points) {
  if (!Array.isArray(points) || points.length<3 || points.length>MAX_VERTICES || points.some(p=>!pointValid(p))) return 'Invalid region vertex count or display coordinates';
  if (polygonArea(points) < .01) return 'Region requires nonzero surface area';
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<.01) return 'Region contains coincident neighbouring vertices';
    for(let j=i+1;j<points.length;j++) {
      if (j===i || j===(i+1)%points.length || i===(j+1)%points.length) continue;
      if(intersects(a,b,points[j],points[(j+1)%points.length])) return 'Region boundary self-intersects';
    }
  }
  return null;
}
export function validateRegions(state) {
  if (state.regions===undefined) return []; // old schema-v1 drafts remain valid
  if (!Array.isArray(state.regions) || state.regions.length>MAX_REGIONS) return ['Invalid draft region collection'];
  const errors=[],ids=new Set(),nodes=new Map(state.nodes.map(n=>[n.id,n]));
  for (const r of state.regions) {
    if (!r || typeof r.id!=='string' || !idPattern.test(r.id) || ids.has(r.id) || nodes.has(r.id)) {errors.push('Invalid or duplicate region identifier');continue;}
    ids.add(r.id);
    if(r.status!=='draft'||typeof r.name!=='string'||!r.name.trim()||r.name.length>100 ||
       typeof r.affiliation!=='string'||r.affiliation.length>100 || !hexPattern.test(r.color)) errors.push('Invalid draft region metadata');
    if(r.parentId!==null && (typeof r.parentId!=='string'||nodes.get(r.parentId)?.kind!=='galaxy'))errors.push('Invalid draft region parent');
    const failure=validatePolygon(r.points);if(failure)errors.push(failure);
  }
  return [...new Set(errors)];
}
export function eligibleGroup(state,ids,view) {
  if(!Array.isArray(ids)||!ids.length||ids.length>MAX_GROUP||new Set(ids).size!==ids.length) return {error:'Select 1–32 distinct draft objects'};
  if(!state?.nodes||!view||!['all','galaxy','system'].includes(view.kind))return {error:'No visible atlas tier'};
  const nodes=ids.map(id=>nodeById(state,id));
  const parent=view.kind==='all'?null:view.id;
  const type=view.kind==='all'?'galaxy':view.kind==='galaxy'?'system':'planet';
  if(nodes.some(n=>!n||n.status!=='draft'||n.parentId!==parent||n.kind!==type))return {error:'Group members must be editable nodes of one visible tier'};
  return {nodes};
}
export function translatedGroup(state,ids,view,delta,step=0) {
  const eligible=eligibleGroup(state,ids,view);if(eligible.error)throw Error(eligible.error);
  if(!Array.isArray(delta)||delta.length!==3||delta.some(v=>!finite(v))||!finite(step)||step<0||step>100)throw Error('Invalid display-unit translation');
  // Snap the shared delta ONCE, rather than snapping each member and distorting the group.
  const wanted=delta.map(v=>step?Math.round(v/step)*step:v);
  const low=[-Infinity,-Infinity,-Infinity],high=[Infinity,Infinity,Infinity];
  for(const node of eligible.nodes)for(let k=0;k<3;k++){
    low[k]=Math.max(low[k],-DISPLAY_LIMIT-node.position[k]);
    high[k]=Math.min(high[k],DISPLAY_LIMIT-node.position[k]);
  }
  const applied=wanted.map((v,k)=>Math.min(high[k],Math.max(low[k],v)));
  return eligible.nodes.map(n=>({id:n.id,position:n.position.map((v,i)=>v+applied[i])}));
}
export function convexHull(input) {
  const p=input.filter(pointValid).map(x=>[...x]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const unique=p.filter((x,i)=>i===0||x[0]!==p[i-1][0]||x[1]!==p[i-1][1]);
  if(unique.length<=2)return unique;
  const lower=[],upper=[];
  for(const x of unique){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),x)<=0)lower.pop();lower.push(x);}
  for(const x of unique.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),x)<=0)upper.pop();upper.push(x);}
  lower.pop();upper.pop();return lower.concat(upper);
}
export function regionFromGroup(state,ids,view,padding=9) {
  const {nodes,error}=eligibleGroup(state,ids,view);if(error)throw Error(error);
  if(!finite(padding)||padding<.5||padding>200)throw Error('Invalid survey padding');
  let pts=convexHull(nodes.map(n=>[n.position[0],n.position[2]]));
  if(pts.length<=2){const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]);const x0=Math.min(...xs)-padding,x1=Math.max(...xs)+padding,z0=Math.min(...zs)-padding,z1=Math.max(...zs)+padding;pts=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];}
  else {
    const cx=pts.reduce((a,b)=>a+b[0],0)/pts.length,cz=pts.reduce((a,b)=>a+b[1],0)/pts.length;
    pts=pts.map(p=>{const x=p[0]-cx,z=p[1]-cz,d=Math.max(1,Math.hypot(x,z));return [p[0]+x/d*padding,p[1]+z/d*padding];});
  }
  pts=pts.map(p=>p.map(v=>Math.max(-DISPLAY_LIMIT,Math.min(DISPLAY_LIMIT,v))));
  if(validatePolygon(pts))throw Error('Cannot construct a valid boundary at this coordinate limit');
  const idsUsed=new Set([...(state.regions||[]).map(r=>r.id),...state.nodes.map(n=>n.id)]);
  let id;do{id='survey-sector-'+Math.random().toString(36).slice(2,9);}while(idsUsed.has(id));
  return {id,name:'NEW SURVEY SECTOR',affiliation:'UNASSIGNED / PROVISIONAL',parentId:view.kind==='all'?null:view.id,
    points:pts,color:'#58ccf2',status:'draft'};
}
export function pointInPolygon([x,z],points) {
  if(!pointValid([x,z])||!Array.isArray(points)||points.length<3)return false;
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if(Math.abs(cross(a,b,[x,z]))<1e-8&&within(a[0],b[0],x)&&within(a[1],b[1],z))return true;
    if ((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function regionReport(state,region) {
  const members=state.nodes.filter(n=>n.status==='draft'&&n.parentId===region.parentId&&['galaxy','system','planet'].includes(n.kind)&&pointInPolygon([n.position[0],n.position[2]],region.points));
  const seen=new Set(members.map(n=>n.id));
  let internal=0,frontier=0;
  for(const r of state.routes) {
    const insideA=seen.has(r.from),insideB=seen.has(r.to);
    if(insideA&&insideB)internal++;
    else if(insideA||insideB)frontier++;
  }
  return {count:members.length, internal, frontier, displayArea:polygonArea(region.points), memberIds:members.map(n=>n.id)};
}
