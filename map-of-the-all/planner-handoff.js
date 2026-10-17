/**
 * Explicit, illustrative .ssp.json export to the existing System Planner importer.
 * No canon geometry, orbital periods or masses are inferred from atlas art.
 * Reference: parent src/persistence/db.ts and export-import.ts (schema 1.1.0).
 */
import { validateAtlas, nodeById, childNodes } from './atlas-data.js';

const KM_PER_AU = 149597870.7;
const SOLAR_MASS_KG = 1.98847e30;
const EARTH_MASS_KG = 5.9722e24;
const SOLAR_GM_KM3_S2 = 1.32712440018e11;
const sourceFlags = Object.freeze({
  sourceCanonStatus:'unknown',
  plannerClassification:'NON-CANON SANDBOX',
  unauthored_in_source:true,
});
const bodyId = input => 'atlas-'+input;

/**
 * Display-space positions supply only an illustrative orbital angle.
 * Orbital radii and physical properties are explicit demonstration defaults.
 */
export function createPlannerHandoff(atlas,systemId,nowIso=new Date().toISOString()){
  const issues=validateAtlas(atlas);
  if(issues.length)throw new Error('Invalid source atlas: '+issues.join('; '));
  const system=nodeById(atlas,systemId);
  if(!system||system.kind!=='system'||system.status!=='draft')throw new Error('Select an editable draft system to export');
  const planets=childNodes(atlas,systemId,'planet');
  if(planets.length>64)throw new Error('Orbital handoff is bounded to 64 draft planets');
  if(typeof nowIso!=='string'||!Number.isFinite(Date.parse(nowIso)))throw new Error('Invalid handoff timestamp');
  const primaryId=bodyId(system.id)+'-primary';
  const primary={
    id:primaryId,name:(system.name+' / hypothetical primary').slice(0,80),type:'star',
    massKg:SOLAR_MASS_KG,radiusKm:695700,luminosityW:3.828e26,temperatureK:5772,
    position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},fixed:true,
    color:'#ffe0b3',...sourceFlags,
  };
  const bodies=[primary,...planets.map((planet,index)=>{
    const radiusKm=(.5+index*.62)*KM_PER_AU;
    const origin=planet.position;
    const theta=Math.hypot(origin[0],origin[2])>1e-8?Math.atan2(origin[2],origin[0]):index*2.39996;
    const speed=Math.sqrt(SOLAR_GM_KM3_S2/radiusKm);
    return {
      id:bodyId(planet.id),name:planet.name.slice(0,80),type:'planet',classification:'rocky',
      primaryId,massKg:EARTH_MASS_KG,radiusKm:6371,albedo:.3,
      position:{x:Math.cos(theta)*radiusKm,y:0,z:Math.sin(theta)*radiusKm},
      velocity:{x:-Math.sin(theta)*speed,y:0,z:Math.cos(theta)*speed},
      color:planet.color,...sourceFlags,
    };
  })];
  const projectName=(system.name+' / ATLAS SANDBOX').slice(0,80);
  const projectId='atlas-handoff-'+system.id;
  return {
    schemaVersion:'1.1.0',projectId,projectName,seed:42,
    branches:[{id:'atlas-origin',name:'Atlas hypothetical initial conditions',parentBranchId:null,
      forkTimeSec:0,createdAtIso:nowIso,snapshot:{timestampSec:0,systemStatus:'active',bodies},events:[]}],
    activeBranchId:'atlas-origin',events:[],systemStatus:'active',belts:[],hookshotRoutes:[],
    simulationSettings:{enableCollisions:true,timeScale:1},
    visualSettings:{scaleMode:'readable',showFuture:false,showSensitivity:false,showGravityGrid:false,
      showXRay:false,showLabels:true,showTrails:false,showHabitableZone:false},
    cameraState:{target:{x:0,y:0,z:0},distance:250,viewMode:'inertial'},
    createdAtIso:nowIso,updatedAtIso:nowIso,
  };
}

export function makeHandoffFilename(project){
  const name=String(project.projectName||'atlas-system').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
  return (name||'atlas-system').slice(0,85)+'.ssp.json';
}

/** Reject invalid or fabricated physics before giving a file to the planner. */
export function validateHandoff(project){
  if(!project||project.schemaVersion!=='1.1.0'||!Array.isArray(project.branches)||project.branches.length!==1)return ['Incompatible project format'];
  const bodies=project.branches[0]?.snapshot?.bodies;
  if(!Array.isArray(bodies)||bodies.length<1||bodies.length>65)return ['Invalid body collection'];
  const errors=[];const ids=new Set();
  for(const body of bodies){
    if(!body||typeof body.id!=='string'||ids.has(body.id))errors.push('Invalid body ID');else ids.add(body.id);
    if(!['star','planet'].includes(body.type)||!Number.isFinite(body.massKg)||body.massKg<=0||!Number.isFinite(body.radiusKm)||body.radiusKm<=0)errors.push('Invalid physical dimensions');
    for(const k of ['position','velocity'])if(!body[k]||['x','y','z'].some(a=>!Number.isFinite(body[k][a])))errors.push('Invalid physical vector');
    if(body.sourceCanonStatus!=='unknown'||body.plannerClassification!=='NON-CANON SANDBOX'||body.unauthored_in_source!==true)errors.push('Improper canon promotion');
  }
  if(bodies.some(b=>b.type==='planet'&&!ids.has(b.primaryId)))errors.push('Unresolved stellar parent');
  return [...new Set(errors)];
}
