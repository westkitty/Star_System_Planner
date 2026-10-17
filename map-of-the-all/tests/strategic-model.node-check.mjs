import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAtlas,validateAtlas,sanitizeAtlas,removeNode} from '../atlas-data.js';
import {MAX_REGIONS,validatePolygon,polygonArea,validateRegions,eligibleGroup,translatedGroup,convexHull,regionFromGroup,pointInPolygon,regionReport} from '../strategic-model.js';

const all={kind:'all',id:null};
const pair=s=>['north-reach','halcyon-arm'];

test('schema v1 supports both old absent regions and new bounded empty regions',()=>{
 const s=seedAtlas();assert.deepEqual(validateAtlas(s),[]);assert.deepEqual(s.regions,[]);
 delete s.regions;assert.deepEqual(validateAtlas(s),[]);
 assert.deepEqual(validateRegions(s),[]);
});
test('group transform preserves relative offsets and applies ONE shared snapped translation',()=>{
 const s=seedAtlas(),ids=pair(s);
 const old=ids.map(id=>s.nodes.find(n=>n.id===id).position);
 const updates=translatedGroup(s,ids,all,[4.3,0,-6.1],1);
 assert.deepEqual(updates.map(u=>u.position),old.map(p=>[p[0]+4,p[1],p[2]-6]));
 assert.deepEqual(old,ids.map(id=>s.nodes.find(n=>n.id===id).position),'calculation does not mutate state');
});
test('group translation near bounds clips the GROUP rigidly, not individually',()=>{
 const s=seedAtlas();s.nodes.find(n=>n.id==='north-reach').position=[9999,1,-20];
 s.nodes.find(n=>n.id==='halcyon-arm').position=[9994,3,40];
 const positions=translatedGroup(s,pair(s),all,[10,0,0]);
 assert.deepEqual(positions.map(u=>u.position[0]),[10000,9995]);
});
test('group rejects mixed-tier, references, stale IDs, duplicate and excess',()=>{
 const s=seedAtlas(),sys=s.nodes.find(n=>n.kind==='system');
 assert.match(eligibleGroup(s,['worldsvault'],all).error,/editable/);
 assert.match(eligibleGroup(s,['north-reach',sys.id],all).error,/visible/);
 assert.match(eligibleGroup(s,['north-reach','north-reach'],all).error,/distinct/);
 assert.match(eligibleGroup(s,Array(33).fill('north-reach'),all).error,/32/);
 assert.throws(()=>translatedGroup(s,['worldsvault'],all,[1,0,0]));
});
test('polygon validator rejects bow-ties, repeated vertices and nonfinite values',()=>{
 assert.equal(validatePolygon([[0,0],[5,0],[5,5],[0,5]]),null);
 assert.match(validatePolygon([[0,0],[5,5],[0,5],[5,0]]),/area|intersect/);
 assert.match(validatePolygon([[0,0],[5,0],[5,0],[0,5]]),/coincident|intersect/);
 assert.match(validatePolygon([[0,0],[5,0],[NaN,3]]),/Invalid/);
 assert.equal(polygonArea([[0,0],[2,0],[2,2],[0,2]]),4);
});
test('convex hull is independent of input ordering',()=>{
 assert.deepEqual(convexHull([[1,1],[0,0],[2,0],[0,2],[1,1],[2,2]]),[[0,0],[2,0],[2,2],[0,2]]);
});
test('sector from selection is typed draft, valid, and uses unmeasured DISPLAY units',()=>{
 const s=seedAtlas(),r=regionFromGroup(s,pair(s),all);
 assert.equal(r.parentId,null);assert.equal(r.status,'draft');assert.equal(r.affiliation,'UNASSIGNED / PROVISIONAL');
 assert.equal(validatePolygon(r.points),null);assert.ok(polygonArea(r.points)>1);
 s.regions.push(r);assert.deepEqual(validateAtlas(s),[]);
 assert.ok(regionReport(s,r).count>=2);
});
test('sector reports membership, internal and frontier corridor counts',()=>{
 const s=seedAtlas(),r={id:'sample-sector',name:'Sector',affiliation:'PROVISIONAL',status:'draft',parentId:null,color:'#aabbcc',points:[[-150,-100],[10,-100],[10,100],[-150,100]]};
 const report=regionReport(s,r);
 assert.ok(report.memberIds.includes('north-reach'));
 assert.ok(report.memberIds.includes('perseus-confluence'));
 assert.ok(report.internal>=1);assert.ok(report.frontier>=1);
 assert.equal(pointInPolygon([-102,-46],r.points),true);
 assert.equal(pointInPolygon([200,200],r.points),false);
});
test('region color, authority, parent, ID and shape errors fail before persistence',()=>{
 const s=seedAtlas(),r=regionFromGroup(s,['north-reach'],all);s.regions.push(r);
 const variants=[
  x=>x.status='reference',x=>x.color='#f00',x=>x.parentId='worldsvault',x=>x.points=[[0,0],[2,2],[0,2],[2,0]],
  x=>x.id='north-reach',x=>x.affiliation='x'.repeat(101)
 ];
 for(const mutate of variants){const copy=structuredClone(s);mutate(copy.regions[0]);assert.ok(validateAtlas(copy).length>0);assert.throws(()=>sanitizeAtlas(copy));}
});
test('removing a galaxy removes orphan regions without touching unrelated drafts',()=>{
 const s=seedAtlas(),g=s.nodes.find(n=>n.kind==='galaxy'),one=regionFromGroup(s,[g.id],all),two=regionFromGroup(s,['halcyon-arm-system-1'],{kind:'galaxy',id:'halcyon-arm'});
 s.regions.push(one,two);
 const sysRegion=regionFromGroup(s,[`${g.id}-system-1`],{kind:'galaxy',id:g.id});s.regions.push(sysRegion);
 removeNode(s,g.id);assert.equal(s.regions.some(r=>r.id===sysRegion.id),false);
 assert.equal(s.regions.some(r=>r.id===one.id),true);
 assert.equal(s.regions.some(r=>r.id===two.id),true);
});
test('validation caps region and vertex count',()=>{
 const s=seedAtlas();const r=regionFromGroup(s,['north-reach'],all);
 s.regions=Array.from({length:MAX_REGIONS+1},(_,i)=>({...r,id:'r'+i}));
 assert.ok(validateAtlas(s).includes('Invalid draft region collection'));
 assert.match(validatePolygon(Array.from({length:25},(_,i)=>[Math.cos(i),Math.sin(i)])),/count/);
});
