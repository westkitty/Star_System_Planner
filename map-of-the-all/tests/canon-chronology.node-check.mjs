import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BLOOD_ECLIPSE_CANON as c} from '../canon-chronology.js';
import {EPOCHS,seedAtlas,validateAtlas} from '../atlas-data.js';
import {ensureTimeline,switchEra} from '../temporal-model.js';

test('the Blood Eclipse War is exactly 170 years with the documented anchors',()=>{
 assert.equal(c.durationYears,170);
 assert.deepEqual(c.documentedMarkers.map(x=>[x.marker,x.startYear,x.endYear]),[
  ['Year 0',0,0],['Year 3',3,3],['Years 7–120',7,120],['Year 121',121,121],['Year 170',170,170],
 ]);
 for(const marker of c.documentedMarkers)assert.ok(marker.endYear<=c.durationYears);
 assert.ok(c.sourceLinks.narrative.endsWith('chronology.body.html'));
 assert.ok(c.sourceLinks.invariants.endsWith('invariants.json'));
});
test('final collapse and containment preserve causal ordering but do not fabricate times',()=>{
 assert.deepEqual(c.finalCausalSequence.map(x=>x.id),[
  'aureal-gate-starsilk','halven-heliocide','siege-wall-formation','siege-wall-locking',
 ]);
 assert.deepEqual(c.finalCausalSequence.map(x=>x.authoredMarker),['Year 170',null,null,'Post-War Era']);
});
test('no rejected 17-year timeline survives in committed Atlas chronology and documentation',()=>{
 const sources=[
  new URL('../canon-chronology.js',import.meta.url),
  new URL('../atlas-data.js',import.meta.url),
  new URL('../docs/BLOOD_ECLIPSE_CHRONOLOGY.md',import.meta.url),
  new URL('../docs/PHASE6_TEMPORAL_CARTOGRAPHY.md',import.meta.url),
 ];
 const rejected=[/\b17[- ]year\b/i,/\bseventeen[- ]year\b/i,/\b17 years\b/i,
  /\bseventeen years\b/i,/\bYear 17\b/i,/\bYear 12\s*:\s*.*Ruby Eclipse/i,
  /\bYear 7\s*:\s*.*heliocide/i,/chronological desynchronization/i,/17-year hard cut/i];
 for(const path of sources){
  const data=readFileSync(path,'utf8');
  for(const rx of rejected)assert.doesNotMatch(data,rx,`${path.pathname}: ${rx}`);
 }
 assert.match(EPOCHS[0].note,/170-year/);
});
test('chronology display corrections leave era snapshot identity and storage untouched',()=>{
 const state=seedAtlas(),before=JSON.stringify({nodes:state.nodes,routes:state.routes,regions:state.regions,layers:state.layers});
 assert.deepEqual(validateAtlas(state),[]);
 assert.equal(state.version,1);
 assert.deepEqual(EPOCHS.map(e=>e.id),['war','locking','post']);
 ensureTimeline(state);
 assert.equal(switchEra(state,'war'),true);
 assert.deepEqual(validateAtlas(state),[]);
 assert.deepEqual(JSON.stringify({nodes:state.nodes,routes:state.routes,regions:state.regions,layers:state.layers}),before);
});
