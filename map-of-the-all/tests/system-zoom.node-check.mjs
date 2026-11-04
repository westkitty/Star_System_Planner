import test from 'node:test';
import assert from 'node:assert/strict';
import {findGalaxyZoomTarget,findSystemZoomTarget,findPlanetZoomTarget,shouldAscendZoom,tierEntryScale,smoothZoomProgress,closePlanetCameraDistance,SYSTEM_ZOOM_RADIUS} from '../system-zoom.js';
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

test('continuous semantic zoom can enter galaxy, system and planet without false positives',()=>{
  const galaxy={id:'g',kind:'galaxy',distance:45,screenX:0,screenY:0};
  const system={id:'s',kind:'system',distance:12,screenX:0,screenY:0};
  const planet={id:'p',kind:'planet',distance:8,screenX:0,screenY:0};
  assert.equal(findGalaxyZoomTarget({viewKind:'all',zooming:true,candidates:[galaxy]}),'g');
  assert.equal(findGalaxyZoomTarget({viewKind:'galaxy',zooming:true,candidates:[galaxy]}),null);
  assert.equal(findGalaxyZoomTarget({viewKind:'all',zooming:true,blocked:true,candidates:[galaxy]}),null);
  assert.equal(findGalaxyZoomTarget({viewKind:'all',zooming:true,candidates:[{...galaxy,screenY:1.0}]}),null);
  assert.equal(findSystemZoomTarget({viewKind:'galaxy',zooming:true,candidates:[system]}),'s');
  assert.equal(findPlanetZoomTarget({viewKind:'system',zooming:true,candidates:[planet]}),'p');
  assert.equal(findPlanetZoomTarget({viewKind:'system',zooming:true,blocked:true,candidates:[planet]}),null);
  assert.equal(findPlanetZoomTarget({viewKind:'system',zooming:true,candidates:[{...planet,distance:20}]}),null);
});
test('outward camera distance reversibly ascends only from a valid tier',()=>{
  assert.equal(shouldAscendZoom({viewKind:'system',zoomingOut:true,distance:230}),true);
  assert.equal(shouldAscendZoom({viewKind:'galaxy',zoomingOut:true,distance:290}),true);
  assert.equal(shouldAscendZoom({viewKind:'all',zoomingOut:true,distance:900}),false);
  assert.equal(shouldAscendZoom({viewKind:'system',zoomingOut:false,distance:280}),false);
  assert.equal(shouldAscendZoom({viewKind:'system',zoomingOut:true,blocked:true,distance:280}),false);
  assert.equal(shouldAscendZoom({viewKind:'system',zoomingOut:true,distance:NaN}),false);
});
test('scene scale easing is finite, bounded, reversible and never alters saved node positions',()=>{
  for(const n of [-2,0,.1,.5,.9,1,2,Infinity,NaN]){
    const eased=smoothZoomProgress(n);
    assert.ok(Number.isFinite(eased)&&eased>=0&&eased<=1);
  }
  assert.equal(smoothZoomProgress(0),0);
  assert.equal(smoothZoomProgress(1),1);
  assert.equal(smoothZoomProgress(.5),.5);
  for(const n of [.5,1,1.4]){
    const into=tierEntryScale('all','galaxy',n);
    const out=tierEntryScale('galaxy','all',n);
    assert.ok(into>0&&Number.isFinite(into));
    assert.ok(Math.abs(into*out-1)<1e-10);
  }
  assert.equal(tierEntryScale('galaxy','system'),.25);
  assert.equal(tierEntryScale('system','galaxy'),4);
});
