import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAtlas,validateAtlas,sanitizeAtlas,removeNode,addNode,nodeById,childNodes,CANON_BASE,EPOCHS,LAYERS} from '../atlas-data.js';

test('seed is coherent and every map position is explicitly a draft illustration',()=>{
 const s=seedAtlas();assert.deepEqual(validateAtlas(s),[]);
 assert.equal(s.nodes.filter(n=>n.kind==='galaxy').length,7);
 assert.equal(s.nodes.filter(n=>n.kind==='system').length,35);
 assert.equal(s.nodes.filter(n=>n.kind==='planet').length,105);
 assert.equal(s.nodes.filter(n=>n.status==='reference').length,2);
 assert.equal(s.routes.length,10);assert.equal(LAYERS.length,11);assert.equal(EPOCHS.length,3);
});
test('source concept is forkable without editing source identity',()=>{
 const s=seedAtlas(),reference=nodeById(s,'worldsvault');assert.equal(reference.status,'reference');
 const fork=structuredClone(reference);fork.id='illustrative-fork';fork.status='draft';fork.sourceUrl=null;
 s.nodes.push(fork);fork.position=[5,0,0];assert.equal(reference.position[0],-20);assert.deepEqual(validateAtlas(s),[]);
});
test('source-untrusted JSON cannot claim authority through import',()=>{
 const original=seedAtlas();const imported=sanitizeAtlas(original);
 assert.equal(original.nodes.some(n=>n.status==='reference'),true);
 assert.equal(imported.nodes.some(n=>n.status==='reference'||n.sourceUrl),false);
 assert.deepEqual(validateAtlas(imported),[]);
});
test('reject untrusted source URLs and malformed spatial coordinates',()=>{
 const s=seedAtlas();s.nodes[0].sourceUrl='https://example.org/forged';s.nodes[1].position=[Number.NaN,2,4];
 const failures=validateAtlas(s);assert.ok(failures.includes('Untrusted canon URL'));assert.ok(failures.includes('Invalid node geometry or name'));
 assert.throws(()=>sanitizeAtlas(s));
});
test('nested cleanup deletes descendant objects and their corridors',()=>{
 const s=seedAtlas();const g=s.nodes.find(n=>n.kind==='galaxy');
 const descendants=childNodes(s,g.id,'system').map(n=>n.id);
 assert.equal(descendants.length,5);const count=removeNode(s,g.id);
 assert.equal(count,21);assert.equal(nodeById(s,g.id),null);
 assert.equal(s.routes.some(r=>r.from===g.id||r.to===g.id),false);
 assert.deepEqual(validateAtlas(s),[]);
});
test('added annotations are typed as draft and valid in galaxy and stellar views',()=>{
 const s=seedAtlas(),a=addNode(s,'annotation','north-reach');a.name='My survey note';
 assert.equal(a.status,'draft');assert.equal(a.parentId,'north-reach');
 assert.deepEqual(validateAtlas(s),[]);
});
test('cyclic parent graphs rejected and source URL prefix is constrained',()=>{
 const s=seedAtlas();const a=s.nodes.find(n=>n.id==='north-reach');a.parentId='north-reach';
 assert.notDeepEqual(validateAtlas(s),[]);
 assert.equal(CANON_BASE.startsWith('https://'),true);
});
test('high object counts are rejected before loading scene',()=>{
 const s=seedAtlas();while(s.nodes.length<751){const n=addNode(s,'annotation');n.name='Unverified';}
 assert.ok(validateAtlas(s).includes('Invalid node collection'));
});


test('number editor accepts generated fractional values without step mismatch',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['objX','objY','objZ','objSize']) {
    assert.match(html,new RegExp('id="'+id+'"[^>]*step="any"'));
  }
});
test('hidden form and mobile inspector dismissal are regression guarded',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../atlas.css',import.meta.url),'utf8');
  const main=readFileSync(new URL('../main.js',import.meta.url),'utf8');
  assert.match(html,/id="objectForm"[^>]*hidden/);
  assert.ok(css.includes('[hidden]{display:none!important}'));
  assert.match(html,/id="closeMobileInspector"/);
  assert.ok(main.includes('closeMobileInspector'));
});
