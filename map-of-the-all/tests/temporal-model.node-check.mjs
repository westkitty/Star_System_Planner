import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedAtlas,validateAtlas,sanitizeAtlas,removeNode} from '../atlas-data.js';
import {ERA_IDS,ensureTimeline,syncEra,switchEra,cloneEra,writeEraNote,captureEra,compareEras,eraSummary,validateTimeline} from '../temporal-model.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const fresh=()=>{const state=seedAtlas();ensureTimeline(state);return state;};
const check=state=>assert.deepEqual(validateAtlas(state),[]);

test('legacy schema-v1 state still validates without timeline',()=>check(seedAtlas()));
test('old drafts acquire independent identical initial snapshots',()=>{
 const state=fresh();check(state);
 assert.deepEqual(Object.keys(state.timeline.snapshots),['war','locking','post']);
 assert.equal(state.timeline.snapshots.war.nodes[0].name,state.nodes[0].name);
 assert.notStrictEqual(state.timeline.snapshots.war.nodes,state.timeline.snapshots.post.nodes);
});
test('changing one era and switching preserves separate object names',()=>{
 const state=fresh();const original=state.nodes[0].name;
 state.nodes[0].name='POST / REVISION';syncEra(state);check(state);
 assert.equal(switchEra(state,'war'),true);check(state);assert.equal(state.nodes[0].name,original);
 state.nodes[0].name='WAR / REVISION';syncEra(state);check(state);
 switchEra(state,'post');check(state);assert.equal(state.nodes[0].name,'POST / REVISION');
 switchEra(state,'war');check(state);assert.equal(state.nodes[0].name,'WAR / REVISION');
});
test('layers, corridors and region lists are independent across eras',()=>{
 const s=fresh();const postCount=s.routes.length;
 s.layers.grid=true;s.routes.pop();syncEra(s);switchEra(s,'war');
 assert.equal(s.layers.grid,false);assert.equal(s.routes.length,postCount);
 switchEra(s,'post');assert.equal(s.layers.grid,true);assert.equal(s.routes.length,postCount-1);check(s);
});
test('deleting a draft in one era preserves objects in other eras',()=>{
 const s=fresh();const target=s.nodes[0].id;
 removeNode(s,target);syncEra(s);check(s);
 switchEra(s,'war');assert.ok(s.nodes.find(n=>n.id===target));
 switchEra(s,'post');assert.ok(!s.nodes.find(n=>n.id===target));
});
test('era switching is atomic and same-era no-op',()=>{
 const s=fresh(),before=JSON.stringify(s);
 assert.equal(switchEra(s,'post'),false);assert.equal(JSON.stringify(s),before);
 assert.throws(()=>switchEra(s,'Y121'),/Unknown Starsilk era/);check(s);
});
test('copying one era into another requires explicit differing destination',()=>{
 const s=fresh();s.nodes[0].name='FUTURE DRAFT';syncEra(s);
 cloneEra(s,'post','locking');check(s);assert.equal(s.timeline.snapshots.locking.nodes[0].name,'FUTURE DRAFT');
 assert.notEqual(s.timeline.snapshots.war.nodes[0].name,'FUTURE DRAFT');
 assert.throws(()=>cloneEra(s,'war','war'),/different/);
 switchEra(s,'locking');assert.equal(s.nodes[0].name,'FUTURE DRAFT');
});
test('era metadata accepts bounded editorial notes only',()=>{
 const s=fresh();writeEraNote(s,'post','Hypothesis, not historical fact');check(s);
 assert.equal(s.timeline.notes.post,'Hypothesis, not historical fact');
 assert.throws(()=>writeEraNote(s,'post','X'.repeat(801)),/Invalid provisional/);
 assert.throws(()=>writeEraNote(s,'nonexistent','hi'),/Invalid provisional/);
});
test('imported source identities are demoted in every era snapshot',()=>{
 const s=fresh();check(s);
 const imported=sanitizeAtlas(s);check(imported);
 for(const era of ERA_IDS)for(const n of imported.timeline.snapshots[era].nodes){assert.equal(n.status,'draft');assert.equal(n.sourceUrl,null);}
 assert.ok(s.timeline.snapshots.war.nodes.some(n=>n.status==='reference'),'source remains in original');
});
test('malformed or excessive snapshots are rejected instead of silently loaded',()=>{
 const base=fresh();for(const mutate of [
   s=>{delete s.timeline.snapshots.war;},
   s=>{s.timeline.snapshots.war.nodes[0].position=[Infinity,0,0];},
   s=>{s.timeline.snapshots.locking.routes[0].to='missing-id';},
   s=>{s.timeline.notes.post='Q'.repeat(900);},
   s=>{s.timeline.version=5;},
   s=>{s.timeline.snapshots.extra=captureEra(s);},
 ]){const s=clone(base);mutate(s);assert.ok(validateAtlas(s).length>0);}
});
test('active timeline mirror mismatch is rejected',()=>{
 const s=fresh();s.nodes[0].name='UNSAVED MUTATION';assert.match(validateAtlas(s)[0],/Active era differs/);
 syncEra(s);check(s);
});
test('delta distinguishes added, removed, moved, renamed, route and layer changes',()=>{
 const s=fresh();const old=clone(s.timeline.snapshots.war);
 s.nodes[0].position[0]+=7;s.nodes[1].name='RELABELED';s.nodes.push({...clone(s.nodes[0]),id:'new-test',name:'NEW DRAFT'});
 s.routes.pop();s.layers.grid=true;syncEra(s);check(s);
 const diff=compareEras(old,s.timeline.snapshots.post);
 assert.equal(diff.nodes.added.length,1);assert.equal(diff.nodes.removed.length,0);
 assert.equal(diff.moved.length,1);assert.equal(diff.renamed.length,1);
 assert.equal(diff.routes.removed.length,1);assert.deepEqual(diff.layers,['grid']);
 assert.ok(diff.total>=5);assert.equal(eraSummary(diff).length,8);
});
test('comparing snapshots is read-only and tolerant of zero deltas',()=>{
 const s=fresh(),before=JSON.stringify(s);
 const diff=compareEras(s.timeline.snapshots.war,s.timeline.snapshots.post);
 assert.equal(diff.total,0);assert.equal(JSON.stringify(s),before);
});
test('portal retains temporal controls, explicit caution and no extra canvas',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 for(const id of ['temporalPanel','temporalOpen','temporalScrub','temporalNote','temporalCompare','temporalCloneBtn','temporalStatus','temporalGhost'])
   assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/No inferred year markers/);
 assert.match(html,/\.\/temporal\.css/);
});
