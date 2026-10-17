/**
 * A read-only, source-evidenced topology projection, NOT a physical star map.
 * Source: Starsilk_Character_Dossier/docs/worldsvault/worldsvault.json
 * Source blob SHA: 862bc476fb8165784704151eed35c915cbf31bf4
 * Every record below is a labeled derivative of that published graph.
 * Unknown coordinates, chronology, canon status, and distances stay unknown.
 */
const BASE = 'https://westkitty.github.io/Starsilk_Character_Dossier/';
const SYSTEMS = BASE + 'entities/systems/';
const COSMIC = BASE + 'entities/cosmic-architecture/';
const CHRONOLOGY = BASE + 'entities/chronology/';
const group = [
  ['reconstruction', 'Repository / reconstruction'],
  ['containment', 'Containment'],
  ['aureal', 'Aureal'],
  ['meridian', 'Meridian'],
  ['travel', 'Travel / deployment'],
];
const item = (id, label, kind, category, sourceUrl, identityStatus='publication-derived') => ({
  id, label, kind, group:category, sourceUrl, identityStatus,
  graphUrl:BASE+'worldsvault/#node-'+id,
  canonStatus:'unknown', coordinateStatus:'unauthored',
});
const edge = (relation, from, to, sourceUrl) => ({
  id:`${relation}--${from}--${to}`, relation, from, to,
  certainty:'direct-authored',sourceUrl,
  graphUrl:BASE+'worldsvault/#edge-'+relation+'--'+from+'--'+to,
  geometryStatus:'unknown',
});
export const TOPOLOGY = Object.freeze({
  schema:'starsilk.worldsvault.source-graph/1',
  sourceSha:'862bc476fb8165784704151eed35c915cbf31bf4',
  sourceUrl: BASE+'worldsvault/worldsvault.json',
  groups:group.map(([id,name])=>({id,name})),
  nodes:[
    item('worldsvault','WorldsVault','repository','reconstruction',COSMIC),
    item('extinct-template-set','Thirty extinct-civilization planetary templates','template-set','reconstruction',SYSTEMS),
    item('partition','The Partition','parallel-reality','reconstruction',SYSTEMS),
    item('siege-wall','Siege Wall','containment-boundary','containment',COSMIC),
    item('drakken-domain','Drakken domain','regional-domain','containment',CHRONOLOGY),
    item('mother','Mother','homeworld','aureal',SYSTEMS,'existing-authored-stable-id'),
    item('aureal-nebula','Aureal Nebula','nebula','aureal',SYSTEMS),
    item('meridian-station','Meridian Station','orbital-station','meridian',COSMIC),
    item('virgil','Virgil','gas-giant','meridian',COSMIC),
    item('hookshot-network','Hookshot Network','travel-infrastructure','travel',SYSTEMS),
    item('codified-waves','Codified Waves','deployment-doctrine','travel',SYSTEMS),
  ],
  edges:[
    edge('contains','worldsvault','extinct-template-set',SYSTEMS),
    edge('seeds','extinct-template-set','partition',SYSTEMS),
    edge('contains','siege-wall','drakken-domain',CHRONOLOGY),
    edge('located-in','mother','aureal-nebula',SYSTEMS),
    edge('orbits','meridian-station','virgil',COSMIC),
    edge('uses','codified-waves','hookshot-network',SYSTEMS),
  ],
  disclaimer:'Relationship topology is published; positions, metric distances, directions, routes, and each record\'s per-node canon status are not authored.',
});

/** Intentionally display-only positions: never persisted to atlas drafts. */
export function conceptualLayout(graph=TOPOLOGY){
  return graph.nodes.map(n=>{
    const col=graph.groups.findIndex(g=>g.id===n.group);
    const siblings=graph.nodes.filter(x=>x.group===n.group);
    const ordinal=siblings.findIndex(x=>x.id===n.id);
    return {...n,diagramX:120+col*234,diagramY:124+ordinal*123+(siblings.length===2?42:0),coordinateStatus:'unauthored'};
  });
}
export function linksForNode(id,graph=TOPOLOGY){return graph.edges.filter(e=>e.from===id||e.to===id);}
export function validateSourceTopology(graph=TOPOLOGY){
  const errors=[];
  if(!graph||graph.schema!=='starsilk.worldsvault.source-graph/1')return ['Bad source-graph schema'];
  if(!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)||!Array.isArray(graph.groups))return ['Missing graph arrays'];
  if(graph.nodes.length!==11||graph.edges.length!==6)errors.push('Source count mismatch');
  if(!/^[0-9a-f]{40}$/.test(graph.sourceSha))errors.push('Source hash missing');
  const ids=new Set(),edgeIds=new Set(),groupIds=new Set(graph.groups.map(g=>g.id));
  const isTrusted=u=>typeof u==='string'&&u.startsWith(BASE)&&!u.includes('\\')&&!/[<>\s]/.test(u)&&!u.includes('..');
  if(!isTrusted(graph.sourceUrl))errors.push('Untrusted snapshot URL');
  for(const n of graph.nodes){
    if(!n||typeof n.id!=='string'||ids.has(n.id))errors.push('Duplicate or invalid source node');else ids.add(n.id);
    if(!groupIds.has(n.group)||n.coordinateStatus!=='unauthored'||n.canonStatus!=='unknown'||'position'in n||'coordinates'in n)errors.push('Source falsely asserts spatial/canon status');
    if(!isTrusted(n.graphUrl)||!isTrusted(n.sourceUrl)||n.identityStatus!=='publication-derived'&&n.identityStatus!=='existing-authored-stable-id')errors.push('Untrusted node evidence');
  }
  for(const e of graph.edges){
    if(!e||edgeIds.has(e.id)||!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)errors.push('Invalid source edge');else edgeIds.add(e.id);
    if(e.certainty!=='direct-authored'||e.geometryStatus!=='unknown'||!isTrusted(e.sourceUrl)||!isTrusted(e.graphUrl)||'position'in e||'distance'in e)errors.push('Edge promoted to unverified geometry');
  }
  return [...new Set(errors)];
}
