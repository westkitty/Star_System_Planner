import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutVisibleLabels} from '../label-layout.js';
const item=(id,x,d=1)=>({n:{id},x,y:30,d,wd:100,ht:20});
test('selected label outranks closer collision',()=>{
 assert.deepEqual(layoutVisibleLabels([item('near',20),item('selected',20,30)],'selected').map(x=>x.n.id),['selected']);
});
test('unselected labels preserve nearest order',()=>{
 assert.deepEqual(layoutVisibleLabels([item('far',200,20),item('near',20)],null).map(x=>x.n.id),['near','far']);
});
test('overlap does not consume remaining budget',()=>{
 assert.deepEqual(layoutVisibleLabels([item('one',20),item('blocked',25,2),item('next',200,3)],null,2).map(x=>x.n.id),['one','next']);
});
test('invalid projections and zero budget are rejected',()=>{
 assert.deepEqual(layoutVisibleLabels([item('x',20),{...item('invalid',300),x:NaN}],null,2).map(x=>x.n.id),['x']);
 assert.deepEqual(layoutVisibleLabels([item('x',20)],null,0),[]);
});
