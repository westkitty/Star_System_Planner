import * as THREE from 'three';

/**
 * Non-canonical orbital dressing, derived from the system's stable ID and the
 * existing editable planets. The output is never serialized or sent to Planner.
 * Planet orbits remain based on their authored display coordinates.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function hash(value){
  let h=2166136261;
  for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function random(seed){
  let s=hash(seed);
  return ()=>{s=(s+0x6d2b79f5)>>>0;let t=Math.imul(s^(s>>>15),1|s);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function planSystemDetails(systemId,planets,quality='balanced'){
  const radii=planets.map(n=>Math.hypot(Number(n.position?.[0])||0,Number(n.position?.[2])||0))
    .filter(r=>Number.isFinite(r)&&r>=6).sort((a,b)=>a-b);
  let radius=clamp((radii.at(-1)||23)+12,18,140),widest=0;
  for(let i=1;i<radii.length;i++){
    const gap=radii[i]-radii[i-1];
    if(gap>Math.max(12,widest)){widest=gap;radius=clamp((radii[i-1]+radii[i])/2,18,140);}
  }
  const moonHostCount=Math.min(planets.length,quality==='battery'?5:10);
  const moons=Array.from({length:moonHostCount},(_,i)=>({
    parentId:planets[i].id,
    count:quality==='cinematic'&&i%3===2?2:1
  }));
  return {
    systemId,asteroidCount:quality==='cinematic'?620:quality==='battery'?75:270,
    beltRadius:radius,moons,
    companion:hash(systemId+':binary')%5===0,
    comet:quality!=='battery'
  };
}
function circle(radius,color,opacity,segments=100){
  const p=[];for(let i=0;i<=segments;i++){
    const a=i*Math.PI*2/segments;p.push(new THREE.Vector3(Math.cos(a)*radius,0,Math.sin(a)*radius));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(p),
    new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
}
export function makeSystemDressing(plan){
  const group=new THREE.Group();group.name='illustrative-system-dressing';
  const actors=[],rnd=random(plan.systemId+':debris');
  const belt=new THREE.Group();belt.name='illustrative-asteroid-belt';
  const mesh=new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(.55,0),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.86,depthWrite:true}),
    plan.asteroidCount
  );
  mesh.name='batched-asteroids';
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  const colors=[0x61748a,0x8294a8,0xb1aca7,0x515c73,0x98bbce];
  for(let i=0;i<plan.asteroidCount;i++){
    const theta=rnd()*Math.PI*2,ring=plan.beltRadius+(rnd()-.5)*6;
    dummy.position.set(Math.cos(theta)*ring,(rnd()-.5)*2.1,Math.sin(theta)*ring);
    dummy.rotation.set(rnd()*Math.PI,rnd()*Math.PI,rnd()*Math.PI);
    const scale=.16+Math.pow(rnd(),3)*.67;dummy.scale.set(scale*(.7+rnd()*.6),scale*(.5+rnd()),scale*(.7+rnd()*.6));
    dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    mesh.setColorAt(i,color.setHex(colors[Math.floor(rnd()*colors.length)]));
  }
  mesh.instanceMatrix.needsUpdate=true;
  if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  belt.add(mesh);
  belt.add(circle(plan.beltRadius,0x598baf,.13));
  group.add(belt);actors.push({obj:belt,speed:.0000025});
  if(plan.comet){
    const cometPath=circle(plan.beltRadius+9,0x9bb5c9,.11);
    cometPath.scale.z=.72;group.add(cometPath);
    const track=new THREE.Group();track.name='illustrative-orbiting-comet';
    const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.68,1),
      new THREE.MeshBasicMaterial({color:0xd2f7ff}));
    track.add(head);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.35,2.7,7),
      new THREE.MeshBasicMaterial({color:0x55c7f4,transparent:true,opacity:.4,depthWrite:false}));
    tail.rotation.z=-Math.PI/2;tail.position.x=-1.6;track.add(tail);
    group.add(track);
    actors.push({obj:track,orbit:plan.beltRadius+9,flattenZ:.72,offsetY:2,phase:1.4,speed:.000007});
  }
  if(plan.companion){
    const companionOrbit=5.8;
    group.add(circle(companionOrbit,0xc9bc95,.17,80));
    const companion=new THREE.Group();companion.name='illustrative-binary-companion';
    const star=new THREE.Mesh(new THREE.SphereGeometry(1.5,24,16),
      new THREE.MeshBasicMaterial({color:0xffe3bb}));
    companion.add(star);
    const halo=new THREE.Mesh(new THREE.SphereGeometry(2,20,14),
      new THREE.MeshBasicMaterial({color:0xffe3bb,transparent:true,opacity:.10,depthWrite:false}));
    companion.add(halo);group.add(companion);
    actors.push({obj:companion,orbit:companionOrbit,offsetY:.9,phase:.45,speed:.000013});
  }
  return {group,actors,stats:{
    asteroids:plan.asteroidCount,moons:plan.moons.reduce((n,m)=>n+m.count,0),
    comets:plan.comet?1:0,companions:plan.companion?1:0
  }};
}
export function makePlanetMoons(planet,index,count,quality='balanced'){
  const root=new THREE.Group(),actors=[];
  const parentRadius=1.2+planet.size;
  const seed=random(planet.id+':satellite');
  for(let j=0;j<count;j++){
    const orbitRadius=parentRadius+2.3+j*1.45;
    if(quality!=='battery')root.add(circle(orbitRadius,0x7a9eb9,.18,64));
    const pivot=new THREE.Group();pivot.name='illustrative-moon-orbit';
    const moon=new THREE.Mesh(new THREE.IcosahedronGeometry(.31+seed()*.16,quality==='battery'?0:1),
      new THREE.MeshStandardMaterial({color:index%2?0xb7b7af:0x889dab,roughness:1,metalness:.05}));
    moon.name='illustrative-moon';
    moon.position.set(orbitRadius,(seed()-.5)*.45,0);
    pivot.rotation.y=seed()*Math.PI*2;
    pivot.add(moon);root.add(pivot);
    actors.push({obj:pivot,speed:(.00009+index*.000015)/(j+1)});
  }
  return {group:root,actors};
}
