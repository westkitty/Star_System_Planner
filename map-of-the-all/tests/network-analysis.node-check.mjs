import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAtlas} from '../atlas-data.js';
import {draftNetwork,networkComponents,minimumHopPath,networkBridges,networkReport,closureImpact,NETWORK_MAX_NODES} from '../network-analysis.js';
import {validateCorridor} from '../studio-math.js';
const all={kind:'all',id:null};
const graph=(nodes,edges)=>({nodes:nodes.map(id=>({id,name:id})),edges:edges.map(([id,from,to])=>({id,from,to,kind:'hookshot'}))});
const initial=()=>seedAtlas();

test('seven editable galaxies, ten draft corridors, read-only source landmarks excluded',()=>{
 const s=initial(),g=draftNetwork(s,all);
 assert.equal(g.nodes.length,7);assert.equal(g.edges.length,10);
 assert.equal(g.nodes.some(x=>x.id==='worldsvault'),false);
 assert.equal(g.nodes.some(x=>x.id==='mother'),false);
 assert.equal(networkReport(g).componentCount,1);
});
test('BFS chooses minimum hop count, never physical distance, deterministically',()=>{
 const s=initial(),g=draftNetwork(s,all);
 const path=minimumHopPath(g,'north-reach','southern-territories');
 assert.equal(path.hops,3);assert.equal(path.nodes[0],'north-reach');
 assert.equal(path.nodes.at(-1),'southern-territories');
 assert.equal(path.routes.length,path.hops);
 assert.equal('distance' in path,false);
 assert.deepEqual(minimumHopPath(g,'north-reach','north-reach'),{nodes:['north-reach'],routes:[],hops:0});
 assert.equal(minimumHopPath(g,'worldsvault','north-reach'),null);
});
test('kind filter changes active graph without rewriting any corridor',()=>{
 const s=initial(),original=structuredClone(s.routes);
 const hook=draftNetwork(s,all,{kind:'hookshot'}),starsilk=draftNetwork(s,all,{kind:'starsilk'});
 assert.equal(hook.edges.length+starsilk.edges.length,10);
 assert.ok(starsilk.edges.every(x=>x.kind==='starsilk'));
 assert.ok(hook.edges.every(x=>x.kind==='hookshot'));
 assert.deepEqual(s.routes,original);
});
test('closing two incident routes isolates North Reach and alters component count',()=>{
 const s=initial(),g=draftNetwork(s,all,{closed:['lane-1','lane-2']});
 assert.equal(minimumHopPath(g,'north-reach','southern-territories'),null);
 assert.equal(networkReport(g).componentCount,2);
 const effect=closureImpact(s,all,'all',['lane-1','lane-2']);
 assert.equal(effect.addedComponents,1);
 assert.deepEqual(effect.newlyIsolated,['north-reach']);
 assert.equal(s.routes.length,10);
});
test('component reports handle an entirely disconnected galaxy tier',()=>{
 const s=initial(),g=draftNetwork({...s,routes:[]},all),r=networkReport(g);
 assert.equal(r.componentCount,7);assert.equal(r.isolated.length,7);
 assert.equal(r.bridgeCount,0);
 assert.equal(minimumHopPath(g,'north-reach','ember-span'),null);
});
test('chain has two bridge edges, triangle has zero',()=>{
 const a=graph(['a','b','c'],[['r1','a','b'],['r2','b','c']]);
 assert.deepEqual(networkBridges(a),['r1','r2']);
 a.edges.push({id:'r3',from:'a',to:'c',kind:'hookshot'});
 assert.deepEqual(networkBridges(a),[]);
 assert.deepEqual(networkComponents(a),[['a','b','c']]);
});
test('parallel corridors are not single-point bridge failures',()=>{
 const a=graph(['a','b'],[['r1','a','b'],['r2','a','b']]);
 assert.deepEqual(networkBridges(a),[]);
 assert.deepEqual(minimumHopPath(a,'a','b'),{nodes:['a','b'],routes:['r1'],hops:1});
});
test('network analysis honors tier and parent and ignores cross-tier/cross-parent edges',()=>{
 const s=initial();const v={kind:'galaxy',id:'north-reach'},g=draftNetwork(s,v);
 assert.equal(g.nodes.length,5);assert.equal(g.edges.length,0);
 s.routes.push({id:'invented-cross-tier',from:'north-reach-system-1',to:'ember-span-system-1',kind:'hookshot',status:'draft'});
 assert.equal(draftNetwork(s,v).edges.length,0);
});
test('read-only identities cannot appear as pathable nodes or corridors',()=>{
 const s=initial();s.routes.push({id:'false-canon-corridor',from:'worldsvault',to:'north-reach',kind:'hookshot',status:'draft'});
 const g=draftNetwork(s,all);assert.equal(g.edges.length,10);
 assert.equal(validateCorridor(s,'worldsvault','north-reach')!==null,true);
});
test('temporary closures are not serialized into atlas state',()=>{
 const s=initial(),before=JSON.stringify(s);
 draftNetwork(s,all,{closed:['lane-3']});closureImpact(s,all,'hookshot',['lane-4']);
 assert.equal(JSON.stringify(s),before);
});
test('invalid kind, illegal tier and bogus closures are rejected safely',()=>{
 const s=initial();for(const opts of [{kind:'fastest'},{closed:null},{closed:[null]}])assert.throws(()=>draftNetwork(s,all,opts));
 assert.throws(()=>draftNetwork(s,{kind:'supergalaxy',id:null}));
});
test('read-only queries are bounded by 750 nodes and 1000 corridor cap',()=>{
 const s=initial();s.nodes=Array.from({length:NETWORK_MAX_NODES+1},(_,i)=>({id:'n'+i,kind:'galaxy',status:'draft',parentId:null}));
 assert.throws(()=>draftNetwork(s,all));
});
test('candidate corridor checks honor existing same-tier duplicate/identity guard',()=>{
 const s=initial();assert.ok(validateCorridor(s,'north-reach','perseus-confluence'));
 assert.equal(validateCorridor(s,'north-reach','southern-territories'),null);
 assert.ok(validateCorridor(s,'worldsvault','north-reach'));
});
