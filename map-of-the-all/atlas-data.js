export const VERSION = 1;
export const STORAGE_KEY = 'starsilk.map-of-the-all.draft.v1';
export const CANON_BASE = 'https://westkitty.github.io/Starsilk_Character_Dossier';
export const EPOCHS = [
  { id: 'war', title: 'Blood Eclipse War', note: 'Blood Rings documented by Year 3; exact locations here are not authored.' },
  { id: 'locking', title: 'The Siege Wall is locked', note: 'Heliocide containment, black-hole lattice, and costly survival.' },
  { id: 'post', title: 'Post-Siege survey', note: 'Interpretive visualization only. No canonical epoch number is asserted.' },
];
export const LAYERS = [
  ['galaxies','Galactic structures'], ['stars','Stellar detail'],
  ['routes','Hookshot routes'], ['starsilk','Starsilk currents'],
  ['territories','Regional overlays'], ['wall','Siege Wall absence'],
  ['rings','Blood Ring remnants'], ['worldsvault','WorldsVault references'],
  ['annotations','Annotations'], ['labels','Typography'], ['grid','Coordinate guides'],
];
export const DEFAULT_LAYERS = Object.fromEntries(LAYERS.map(([key])=>[key,key!=='grid']));
const galaxyDefs = [
  ['north-reach','NORTH REACH',-102,26,-46,'#83bcff',1.0],
  ['halcyon-arm','HALCYON ARM',-106,-5,18,'#85dcff',0.92],
  ['perseus-confluence','PERSEUS CONFLUENCE',-28,2,7,'#ffe1ac',1.4],
  ['triangulum','TRIANGULUM',-112,-17,57,'#8bbfff',0.68],
  ['centauri-marches','CENTAURI MARCHES',38,1,30,'#bdaaff',0.90],
  ['ember-span','EMBER SPAN',92,6,1,'#ffd5a2',0.93],
  ['southern-territories','SOUTHERN TERRITORIES',130,-12,53,'#7aa9ff',0.83],
];
export const RESEARCH_ANCHORS = [
  { name: 'WorldsVault', description: 'Published topology and its direct-authored relationships; layout is explicitly not canonical.', url: CANON_BASE + '/worldsvault/' },
  { name: 'Cosmic architecture', description: 'Source for prisons, repositories, and containment structures.', url: CANON_BASE + '/entities/cosmic-architecture/' },
  { name: 'The systems', description: 'Drakken, Mother, Rings and documented system concepts.', url: CANON_BASE + '/entities/systems/' },
  { name: 'Canon locks', description: 'Machine-readable canon restrictions and provenance.', url: CANON_BASE + '/canon/' },
];
const makeNode = (id, name, kind, parentId, position, color, size = 1, sourceUrl = null) => ({
  id,name,kind,parentId,position,color,size,description:'',status:'draft',sourceUrl,
  label:{show:true,size:12,color:'#e5f5ff',family:'display'}
});
export function seedAtlas() {
  const nodes = galaxyDefs.map(([id,name,x,y,z,color,size])=>makeNode(id,name,'galaxy',null,[x,y,z],color,size));
  for (const [index, [galId]] of galaxyDefs.entries()) {
    const galaxy = nodes.find(n=>n.id===galId);
    for (let i=0;i<5;i++) {
      const a=i*Math.PI*2/5 + index*.45;
      const id=`${galId}-system-${i+1}`;
      nodes.push(makeNode(id,`SURVEY ${String(index+1).padStart(2,'0')}-${i+1}`,'system',galId,
        [Math.cos(a)*(22+i*3),(i-2)*4,Math.sin(a)*(22+i*3)],i%2?'#91c4ff':'#ffdc9f',0.8+i*.11));
      for(let p=0;p<3;p++) nodes.push(makeNode(`${id}-planet-${p+1}`,`UNNAMED ${p+1}`,'planet',id,
        [Math.cos(p*2.2)*((p+1)*10),Math.sin(p*1.7)*1.1,Math.sin(p*2.2)*((p+1)*10)],
        ['#5daed1','#d4ad7b','#8e9eaf'][p],0.5+p*.22));
    }
  }
  nodes.push({ ...makeNode('worldsvault','WORLDSVAULT','landmark',null,[-20,21,62],'#d6faff',1.1,CANON_BASE+'/worldsvault/'), description:'Source-confirmed repository / topology. This pin is an editorial illustration, not a physical coordinate.', status:'reference' });
  nodes.push({ ...makeNode('mother','MOTHER / AUREAL NEBULA','landmark',null,[99,19,-24],'#ebbb9b',1.0,CANON_BASE+'/worldsvault/'), description:'The Dossier identifies Mother within the Aureal Nebula. This display placement is provisional.', status:'reference' });
  const connections = [
    ['north-reach','perseus-confluence'],['north-reach','halcyon-arm'],
    ['halcyon-arm','triangulum'],['halcyon-arm','perseus-confluence'],
    ['triangulum','centauri-marches'],['perseus-confluence','centauri-marches'],
    ['perseus-confluence','ember-span'],['centauri-marches','ember-span'],
    ['centauri-marches','southern-territories'],['ember-span','southern-territories'],
  ];
  const routes=connections.map(([from,to],i)=>({id:`lane-${i+1}`,from,to,kind:i%3===0?'starsilk':'hookshot',status:'draft'}));
  return { version:VERSION, title:'THE MAP OF THE ALL', epoch:'post', layers:{...DEFAULT_LAYERS},
    nodes,routes, selected:null, quality:'balanced', motion:true, typographyScale:1, updatedAt:new Date().toISOString() };
}
export const childNodes = (state,parentId,kind=null)=>state.nodes.filter(n=>n.parentId===parentId&&(!kind||n.kind===kind));
export const nodeById = (state,id)=>state.nodes.find(n=>n.id===id)||null;
export function ancestry(state,id) {
  const path=[];const visited=new Set();let node=nodeById(state,id);
  while(node&&!visited.has(node.id)){visited.add(node.id);path.unshift(node);node=node.parentId?nodeById(state,node.parentId):null;}
  return path;
}
const isHex = v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
const validName=v=>typeof v==='string'&&v.trim().length>0&&v.length<=100;
const validPos=v=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10000);
export function validateAtlas(value) {
  const errors=[];
  if(!value||typeof value!=='object'||value.version!==VERSION) return ['Unsupported atlas schema version'];
  if(!Array.isArray(value.nodes)||value.nodes.length>750) errors.push('Invalid node collection');
  if(!Array.isArray(value.routes)||value.routes.length>1000) errors.push('Invalid route collection');
  if(errors.length) return errors;
  const ids=new Set();
  for(const n of value.nodes){
    if(!n||typeof n.id!=='string'||!/^[-a-zA-Z0-9_]{1,90}$/.test(n.id)||ids.has(n.id)) errors.push('Invalid or duplicate node ID');
    else ids.add(n.id);
    if(!validName(n.name)||!['galaxy','system','planet','landmark','annotation'].includes(n.kind)||!validPos(n.position)||!isHex(n.color)||!Number.isFinite(n.size)||n.size<=0||n.size>10) errors.push('Invalid node geometry or name');
    if(typeof n.description!=='string'||n.description.length>2500||!['draft','reference'].includes(n.status))errors.push('Invalid node metadata');
    if(!n.label||typeof n.label.show!=='boolean'||!isHex(n.label.color)||!Number.isFinite(n.label.size)||n.label.size<9||n.label.size>36||!['display','mono'].includes(n.label.family))errors.push('Invalid label');
    if(n.sourceUrl!==null&&n.sourceUrl!==undefined&&(typeof n.sourceUrl!=='string'||n.sourceUrl.length>1024||!n.sourceUrl.startsWith(CANON_BASE+'/')))errors.push('Untrusted canon URL');
  }
  const map=new Map(value.nodes.map(n=>[n.id,n]));
  for(const n of value.nodes){
    if(n.parentId!==null&&(!map.has(n.parentId)||map.get(n.parentId).kind===n.kind||n.parentId===n.id))errors.push('Invalid parent');
    const seen=new Set(); let cursor=n;
    while(cursor&&cursor.parentId){if(seen.has(cursor.id)){errors.push('Cyclic parent graph');break;}seen.add(cursor.id);cursor=map.get(cursor.parentId);}
    if(n.kind==='system'&&map.get(n.parentId)?.kind!=='galaxy')errors.push('System must belong to galaxy');
    if(n.kind==='planet'&&map.get(n.parentId)?.kind!=='system')errors.push('Planet must belong to system');
    if(n.kind==='galaxy'&&n.parentId!==null)errors.push('Galaxy must be top-level');
  }
  for(const r of value.routes){if(!r||!ids.has(r.from)||!ids.has(r.to)||r.from===r.to||!['hookshot','starsilk'].includes(r.kind)||!/^[-a-zA-Z0-9_]{1,90}$/.test(r.id)) errors.push('Invalid route');}
  if(!EPOCHS.some(e=>e.id===value.epoch))errors.push('Invalid epoch');
  if(!value.layers||LAYERS.some(([key])=>typeof value.layers[key]!=='boolean'))errors.push('Invalid layers');
  if(!['balanced','cinematic','battery'].includes(value.quality))errors.push('Invalid quality tier');
  if(typeof value.motion!=='boolean'||!Number.isFinite(value.typographyScale)||value.typographyScale<.6||value.typographyScale>2)errors.push('Invalid preferences');
  return [...new Set(errors)];
}
export function sanitizeAtlas(value) {
  const errors=validateAtlas(value);if(errors.length)throw new Error(errors.join('; '));
  const data=JSON.parse(JSON.stringify(value));
  // Imported source pointers do not grant canon authority. Keep the official read-only evidence separate.
  for(const n of data.nodes){n.status='draft';n.sourceUrl=null;}
  data.updatedAt=new Date().toISOString();data.selected=null;
  return data;
}
export function removeNode(state,id){
  const removal=new Set([id]);let changed=true;
  while(changed){changed=false;for(const n of state.nodes)if(n.parentId&&removal.has(n.parentId)&&!removal.has(n.id)){removal.add(n.id);changed=true;}}
  state.nodes=state.nodes.filter(n=>!removal.has(n.id));
  state.routes=state.routes.filter(r=>!removal.has(r.from)&&!removal.has(r.to));
  if(removal.has(state.selected))state.selected=null;
  return removal.size;
}
export function uniqueId(state,prefix){let id;do{id=prefix+'-'+Math.random().toString(36).slice(2,9);}while(state.nodes.some(n=>n.id===id));return id;}
export function addNode(state,kind,parentId=null){
  const id=uniqueId(state,kind),position=kind==='galaxy'?[Math.random()*100-50,0,Math.random()*90]:[Math.random()*20-10,0,Math.random()*20-10];
  const n=makeNode(id,kind==='annotation'?'NEW ANNOTATION':'NEW '+kind.toUpperCase(),kind,parentId,position,kind==='planet'?'#d4ad7b':'#47dfff');
  state.nodes.push(n);return n;
}
