import test from 'node:test';
import assert from 'node:assert/strict';
import {EDIT_MODES,DISPLAY_LENSES,validLabelOffset,moveLabelOffset,snapped,draftPosition,validateCorridor,validMoveTarget} from '../studio-math.js';
import {seedAtlas,validateAtlas,sanitizeAtlas} from '../atlas-data.js';

test('studio modes/lenses are bounded and contain no authority level',()=>{
  assert.deepEqual(EDIT_MODES,['orbit','move','route','label']);
  assert.deepEqual(DISPLAY_LENSES,['survey','signal','cartographer']);
});
test('legacy v1 saves without offsets remain valid; valid offsets round trip',()=>{
  const s=seedAtlas(); assert.deepEqual(validateAtlas(s),[]);
  s.nodes[0].label.offset=[.09,-.04];assert.deepEqual(validateAtlas(s),[]);
  const imported=sanitizeAtlas(s);
  assert.deepEqual(imported.nodes[0].label.offset,[.09,-.04]);
  assert.equal(imported.nodes[0].status,'draft');
});
test('invalid nonfinite/oversized offsets are rejected, not silently repaired',()=>{
  const s=seedAtlas();
  for(const offset of [[NaN,0],[.5,0],[0,Infinity],[0,'0'],[1],null]){
    s.nodes[0].label.offset=offset;
    assert.ok(validateAtlas(s).includes('Invalid label offset'));
    assert.throws(()=>sanitizeAtlas(s));
  }
});
test('normalised label movement is viewport aware, bounded and finite',()=>{
  assert.deepEqual(moveLabelOffset([0,0],48,-30,1200,600),[.04,-.05]);
  assert.deepEqual(moveLabelOffset([.29,.29],300,300,500,500),[.3,.3]);
  assert.equal(validLabelOffset([0,0]),true);assert.equal(validLabelOffset([NaN,0]),false);
  assert.throws(()=>moveLabelOffset([0,0],2,2,0,900));
});
test('spatial gesture snaps the XZ plane without changing Y or inventing km/AU',()=>{
  assert.deepEqual(draftPosition([1.5,3,2],[2.4,500,-3],'xz',1),[4,3,-1]);
  assert.deepEqual(draftPosition([1.5,3,2],[400,2.9,400],'y',1),[1.5,6,2]);
  assert.deepEqual(draftPosition([9999,0,0],[45,0,0],'xz',0),[10000,0,0]);
  assert.equal(snapped(2.52,.5),2.5);
  assert.throws(()=>draftPosition([0,0,0],[NaN,0,0]));
});
test('valid sources for corridor must match kind/parent and be user-draft, no duplicates',()=>{
  const s=seedAtlas();const a=s.nodes.find(n=>n.kind==='system'),b=s.nodes.find(n=>n.kind==='system'&&n.parentId===a.parentId&&n.id!==a.id);
  assert.equal(validateCorridor(s,a.id,b.id),null);
  s.routes.push({id:'route-sample',from:a.id,to:b.id,kind:'starsilk',status:'draft'});
  assert.match(validateCorridor(s,b.id,a.id),/already/);
  assert.match(validateCorridor(s,a.id,a.id),/different/);
  assert.match(validateCorridor(s,'worldsvault',a.id),/Read-only/);
  assert.match(validateCorridor(s,a.id,s.nodes.find(n=>n.kind==='planet').id),/tier/);
});
test('source identities and off-tier objects cannot start direct drag',()=>{
  const s=seedAtlas();const g=s.nodes.find(n=>n.kind==='galaxy');const sys=s.nodes.find(n=>n.kind==='system');
  assert.equal(validMoveTarget(g,{kind:'all',id:null}),true);
  assert.equal(validMoveTarget(sys,{kind:'all',id:null}),false);
  assert.equal(validMoveTarget(sys,{kind:'galaxy',id:sys.parentId}),true);
  assert.equal(validMoveTarget(s.nodes.find(n=>n.id==='worldsvault'),{kind:'all',id:null}),false);
});

test('UI ownership is intentionally one-shot and source references stay outside editor',async()=>{
  const {readFileSync}=await import('node:fs');
  const ui=readFileSync(new URL('../main.js',import.meta.url),'utf8');
  const studio=readFileSync(new URL('../spatial-studio.js',import.meta.url),'utf8');
  const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(ui,/n\.label\.offset\?\{offset:\[\.\.\.n\.label\.offset\]\}/);
  assert.match(ui,/onMove:moveDraftNode,onLabelCommit:moveDraftLabel/);
  assert.match(studio,/this\.onMove\(d\.id,d\.candidate\)/);
  assert.match(studio,/this\.onLabelCommit\(id,offset\)/);
  assert.doesNotMatch(studio,/setAnimationLoop|requestAnimationFrame|requestAnimationLoop/);
  assert.equal((page.match(/data-studio-mode=/g)||[]).length,4);
  assert.match(page,/id="studioCancelRoute"/);
});
