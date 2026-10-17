import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {seedAtlas,addNode,nodeById,validateAtlas} from '../atlas-data.js';
import {TOPOLOGY,conceptualLayout,linksForNode,validateSourceTopology} from '../source-topology.js';
import {createPlannerHandoff,makeHandoffFilename,validateHandoff} from '../planner-handoff.js';
const make=()=>seedAtlas();
const system='perseus-confluence-system-1';
const fixedTime='2026-10-17T11:00:00.000Z';
const clone=obj=>JSON.parse(JSON.stringify(obj));

test('source graph matches 11 published identities and 6 authored relations',()=>{
  assert.deepEqual(validateSourceTopology(),[]);
  assert.equal(TOPOLOGY.nodes.length,11);assert.equal(TOPOLOGY.edges.length,6);
  assert.equal(TOPOLOGY.sourceSha,'862bc476fb8165784704151eed35c915cbf31bf4');
  assert.deepEqual(TOPOLOGY.edges.map(e=>[e.relation,e.from,e.to]),[
    ['contains','worldsvault','extinct-template-set'],
    ['seeds','extinct-template-set','partition'],
    ['contains','siege-wall','drakken-domain'],
    ['located-in','mother','aureal-nebula'],
    ['orbits','meridian-station','virgil'],
    ['uses','codified-waves','hookshot-network']
  ]);
});
test('source node/edge records contain no fabricated spatial coordinate or canonical status',()=>{
  for(const node of TOPOLOGY.nodes){assert.equal(node.coordinateStatus,'unauthored');assert.equal(node.canonStatus,'unknown');
    assert.ok(!('position'in node)&&!('distance'in node)&&!('coordinates'in node));}
  for(const e of TOPOLOGY.edges){assert.equal(e.geometryStatus,'unknown');assert.equal(e.certainty,'direct-authored');
    assert.ok(!('position'in e)&&!('distance'in e));}
});
test('published graph never inherits draft galaxy names or routes',()=>{
  const state=make();state.nodes[0].name='I MOVE THE GALAXY';state.routes=[];
  assert.equal(TOPOLOGY.nodes.some(n=>n.label==='I MOVE THE GALAXY'),false);
  assert.equal(TOPOLOGY.edges.length,6);
  assert.notEqual(TOPOLOGY.nodes.find(n=>n.id==='worldsvault'),nodeById(state,'worldsvault'));
});
test('diagram layout is stable, disposable and excluded from source geometry',()=>{
  const a=conceptualLayout(),b=conceptualLayout();assert.deepEqual(a,b);
  assert.equal(a.length,11);assert.ok(a.every(n=>Number.isFinite(n.diagramX)&&Number.isFinite(n.diagramY)));
  a[0].diagramX=9999;assert.equal(TOPOLOGY.nodes[0].diagramX,undefined);
  assert.equal(conceptualLayout()[0].diagramX,120);
});
test('mother/aureal relation resolves exactly and source records retain evidence links',()=>{
  const edges=linksForNode('mother');assert.equal(edges.length,1);
  assert.equal(edges[0].to,'aureal-nebula');
  assert.ok(edges[0].graphUrl.endsWith('/#edge-located-in--mother--aureal-nebula'));
  assert.ok(TOPOLOGY.nodes.every(n=>n.sourceUrl.startsWith('https://westkitty.github.io/Starsilk_Character_Dossier/')));
});
test('source graph verifier refuses invented coordinates, malicious links, duplicated entities and invented edge status',()=>{
  let bad=clone(TOPOLOGY);bad.nodes[0].position=[1,2,3];assert.ok(validateSourceTopology(bad).includes('Source falsely asserts spatial/canon status'));
  bad=clone(TOPOLOGY);bad.nodes[1].sourceUrl='https://attacker.test/dossier';assert.ok(validateSourceTopology(bad).includes('Untrusted node evidence'));
  bad=clone(TOPOLOGY);bad.nodes[1].id=bad.nodes[0].id;assert.ok(validateSourceTopology(bad).includes('Duplicate or invalid source node'));
  bad=clone(TOPOLOGY);bad.edges[0].geometryStatus='verified';assert.ok(validateSourceTopology(bad).includes('Edge promoted to unverified geometry'));
});
test('SSP handoff exports a complete version 1.1.0 draft compatible with parent structural contract',()=>{
  const state=make(),source=JSON.stringify(state);
  const project=createPlannerHandoff(state,system,fixedTime);
  assert.deepEqual(validateHandoff(project),[]);
  assert.equal(project.schemaVersion,'1.1.0');assert.equal(project.branches.length,1);
  assert.equal(project.branches[0].snapshot.bodies.length,4);
  assert.equal(project.activeBranchId,project.branches[0].id);
  assert.equal(project.branches[0].snapshot.timestampSec,0);
  assert.equal(project.simulationSettings.timeScale,1);
  assert.ok(project.projectId.includes(system));
  assert.equal(JSON.stringify(state),source,'handoff must not mutate authoritative/draft input');
});
test('physical distances are derived from AU sandbox defaults, NOT draft map coordinates',()=>{
  const state=make();const planet=state.nodes.find(n=>n.parentId===system&&n.kind==='planet');
  const project1=createPlannerHandoff(state,system,fixedTime);
  const physical=project1.branches[0].snapshot.bodies[1];
  const initialDistance=Math.hypot(physical.position.x,physical.position.y,physical.position.z);
  assert.ok(Math.abs(initialDistance-0.5*149597870.7)<1e-5);
  assert.ok(physical.massKg>5e24&&physical.massKg<7e24);
  assert.equal(physical.sourceCanonStatus,'unknown');
  assert.equal(physical.plannerClassification,'NON-CANON SANDBOX');
  planet.position=[9000,7000,-9000];assert.deepEqual(validateAtlas(state),[]);
  const project2=createPlannerHandoff(state,system,fixedTime);
  const changed=project2.branches[0].snapshot.bodies[1];
  assert.ok(Math.abs(Math.hypot(changed.position.x,changed.position.y,changed.position.z)-initialDistance)<1e-5);
  assert.equal(changed.massKg,physical.massKg);assert.equal(changed.radiusKm,physical.radiusKm);
});
test('planet velocities are circular and perpendicular with sensible km/s units',()=>{
  const bodies=createPlannerHandoff(make(),system,fixedTime).branches[0].snapshot.bodies;
  for(const planet of bodies.slice(1)){
    const p=planet.position,v=planet.velocity;
    const distance=Math.hypot(p.x,p.y,p.z),speed=Math.hypot(v.x,v.y,v.z);
    assert.ok(Math.abs(p.x*v.x+p.y*v.y+p.z*v.z)<0.0001);
    assert.ok(Math.abs(speed-Math.sqrt(1.32712440018e11/distance))<1e-10);
    assert.equal(planet.primaryId,bodies[0].id);
    assert.equal(planet.unauthored_in_source,true);
  }
});
test('handoff rejects reference node, non-system, orphan ID, invalid physics, bad timestamps',()=>{
  const state=make();
  for(const id of ['worldsvault','mother','north-reach','nonexistent'])assert.throws(()=>createPlannerHandoff(state,id,fixedTime));
  assert.throws(()=>createPlannerHandoff(state,system,'bad-date'));
  const project=createPlannerHandoff(state,system,fixedTime);project.branches[0].snapshot.bodies[1].massKg=-1;
  assert.ok(validateHandoff(project).includes('Invalid physical dimensions'));
});
test('handoff refuses unsafe upper-limit system rather than producing an unbounded physics file',()=>{
  const state=make();for(let i=0;i<62;i++)addNode(state,'planet',system);
  assert.deepEqual(validateAtlas(state),[]);
  assert.throws(()=>createPlannerHandoff(state,system,fixedTime),/bounded to 64/);
});
test('export filename is valid for the parent .ssp.json importer',()=>{
  const p=createPlannerHandoff(make(),system,fixedTime);
  assert.match(makeHandoffFilename(p),/^[a-z0-9-]+\.ssp\.json$/);
});
test('source dialog, safe orbital handoff and provenance affordances are wired',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.js',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../source-graph-ui.js',import.meta.url),'utf8');
  for(const id of ['sourceGraphDialog','sourceGraphOpen','sourceGraphClose','sourceGraphBoard','sourceGraphNodes','sourceGraphRelations','sourceGraphDetails','sourceGraphSearch','handoffExportBtn','handoffOpenPlanner'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(main.includes('createPlannerHandoff(state,system.id)'));
  assert.ok(main.includes('validateHandoff(project)'));
  assert.ok(ui.includes('validateSourceTopology()'));
  assert.ok(html.includes('href="../"'));
});
