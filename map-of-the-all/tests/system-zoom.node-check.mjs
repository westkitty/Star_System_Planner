import test from 'node:test';
import assert from 'node:assert/strict';
import {findSystemZoomTarget,closePlanetCameraDistance,SYSTEM_ZOOM_RADIUS} from '../system-zoom.js';
import {planSystemDetails,makeSystemDressing,makePlanetMoons} from '../system-orbit-details.js';

const planets=[
  {id:'s-p1',kind:'planet',position:[10,0,0],size:.5},
  {id:'s-p2',kind:'planet',position:[-12,1.0,16],size:.7},
  {id:'s-p3',kind:'planet',position:[-9,0,-28],size:.9}
];
test('semantic zoom only descends during deliberate inward dolly near visible system',()=>{
  const candidate={id:'s',kind:'system',distance:12,screenX:.2,screenY:0};
  const frame={viewKind:'galaxy',zooming:true,blocked:false,candidates:[candidate]};
  assert.equal(findSystemZoomTarget(frame),'s');
  assert.equal(findSystemZoomTarget({...frame,zooming:false}),null);
  assert.equal(findSystemZoomTarget({...frame,blocked:true}),null);
  assert.equal(findSystemZoomTarget({...frame,viewKind:'all'}),null);
  assert.equal(findSystemZoomTarget({...frame,viewKind:'system'}),null);
  assert.equal(findSystemZoomTarget({...frame,candidates:[{...candidate,distance:SYSTEM_ZOOM_RADIUS}]}),null);
  assert.equal(findSystemZoomTarget({...frame,candidates:[{...candidate,screenX:.96}]}),null);
  assert.equal(findSystemZoomTarget({...frame,candidates:[{...candidate,kind:'planet'}]}),null);
});
test('selected star is favored only if within valid zoom distance',()=>{
  const frame={viewKind:'galaxy',zooming:true,blocked:false,candidates:[
    {id:'near',kind:'system',distance:8,screenX:0,screenY:0},
    {id:'selected',kind:'system',distance:14,screenX:.2,screenY:0}
  ],selectedId:'selected'};
  assert.equal(findSystemZoomTarget(frame),'selected');
  assert.equal(findSystemZoomTarget({...frame,candidates:[
    frame.candidates[0],{...frame.candidates[1],distance:30}
  ]}),'near');
  assert.ok(closePlanetCameraDistance(.5)>=6.5);
});
test('non-canonical orbital plan is stable, bounded and quality-aware',()=>{
  const a=planSystemDetails('sample-system',planets,'balanced');
  assert.deepEqual(a,planSystemDetails('sample-system',planets,'balanced'));
  assert.equal(a.moons.length,3);
  assert.equal(a.asteroidCount,270);
  assert.ok(a.beltRadius>=18&&a.beltRadius<=140);
  const battery=planSystemDetails('sample-system',planets,'battery');
  assert.equal(battery.asteroidCount,75);
  assert.equal(battery.comet,false);
  const rich=planSystemDetails('sample-system',planets,'cinematic');
  assert.equal(rich.asteroidCount,620);
  assert.ok(rich.moons.reduce((n,m)=>n+m.count,0)>=3);
});
test('real instanced 3D orbital objects exist and moons have own pivot animation',()=>{
  const plan=planSystemDetails('sample-system',planets,'balanced');
  const {group,actors,stats}=makeSystemDressing(plan);
  const asteroid=group.getObjectByName('batched-asteroids');
  assert.equal(asteroid.isInstancedMesh,true);
  assert.equal(asteroid.count,plan.asteroidCount);
  assert.ok(actors.some(a=>a.obj.name==='illustrative-asteroid-belt'));
  assert.equal(stats.asteroids,270);
  const moons=makePlanetMoons(planets[1],1,1,'balanced');
  assert.equal(moons.group.getObjectByName('illustrative-moon').isMesh,true);
  assert.equal(moons.actors.length,1);
  for(const root of [group,moons.group])root.traverse(o=>{
    o.geometry?.dispose?.();
    if(o.material)o.material.dispose();
    o.dispose?.();
  });
});
test('absurd input cannot silently create unbounded orbital meshes',()=>{
  const huge=Array.from({length:500},(_,i)=>({
    id:'p'+i,position:[10000*i,10,-500*i],size:1
  }));
  const plan=planSystemDetails('extreme',huge,'cinematic');
  assert.ok(plan.beltRadius<=140);
  assert.ok(plan.moons.length<=10);
  assert.ok(plan.asteroidCount<=620);
});
