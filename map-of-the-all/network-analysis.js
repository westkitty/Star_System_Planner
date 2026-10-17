/**
 * Phase 5 — bounded analysis of explicitly DRAFT lanes, not physical journeys.
 * Edges are undirected for editorial connectivity only. No distances, transit
 * duration, canonical factions, or permissions are inferred from display layout.
 * Pure deterministic algorithms: no DOM, rendering, state mutation, or deps.
 */
export const NETWORK_KINDS = Object.freeze(['all','hookshot','starsilk']);
export const NETWORK_MAX_NODES = 750;
export const NETWORK_MAX_EDGES = 1000;
const tierTypes = Object.freeze({all:'galaxy',galaxy:'system',system:'planet'});
const byId = (a,b) => a.id.localeCompare(b.id);

/** Include draft-only, same-tier, same-parent nodes and their draft links. */
export function draftNetwork(state,view,{kind='all',closed=[]}={}) {
  if(!state||!Array.isArray(state.nodes)||!Array.isArray(state.routes) ||
     state.nodes.length>NETWORK_MAX_NODES || state.routes.length>NETWORK_MAX_EDGES ||
     !view||!Object.hasOwn(tierTypes,view.kind)||!NETWORK_KINDS.includes(kind))
    throw new Error('Invalid or unsupported network survey');
  if(!Array.isArray(closed)||closed.length>NETWORK_MAX_EDGES||closed.some(x=>typeof x!=='string'))
    throw new Error('Invalid temporary corridor closures');
  const parent=view.kind==='all'?null:view.id;
  const nodes=state.nodes.filter(n=>n?.status==='draft'&&n.kind===tierTypes[view.kind]&&n.parentId===parent)
    .map(n=>({id:n.id,name:n.name,color:n.color})).sort(byId);
  const index=new Map(nodes.map(n=>[n.id,n]));
  const blocked=new Set(closed);
  const edges=state.routes.filter(r=>r?.status==='draft'&&(!kind||kind==='all'||r.kind===kind)&&
    !blocked.has(r.id)&&r.from!==r.to&&index.has(r.from)&&index.has(r.to))
    .map(r=>({id:r.id,from:r.from,to:r.to,kind:r.kind})).sort(byId);
  return {nodes,edges,parentId:parent,tier:view.kind,kind};
}

function adjacency(graph) {
  const table=new Map(graph.nodes.map(n=>[n.id,[]]));
  for(const edge of graph.edges){
    if(!table.has(edge.from)||!table.has(edge.to))continue;
    table.get(edge.from).push({node:edge.to,edge:edge.id});
    table.get(edge.to).push({node:edge.from,edge:edge.id});
  }
  for(const list of table.values())list.sort((a,b)=>a.edge.localeCompare(b.edge)||a.node.localeCompare(b.node));
  return table;
}

/** Components are sorted and reproducible, including isolated draft objects. */
export function networkComponents(graph) {
  const adj=adjacency(graph),seen=new Set(),results=[];
  for(const id of [...adj.keys()].sort()){
    if(seen.has(id))continue;
    const component=[],queue=[id];seen.add(id);
    for(let i=0;i<queue.length;i++){
      const current=queue[i];component.push(current);
      for(const link of adj.get(current))if(!seen.has(link.node)){seen.add(link.node);queue.push(link.node);}
    }
    component.sort();results.push(component);
  }
  return results.sort((a,b)=>a[0].localeCompare(b[0]));
}

/** Shortest by EDGE COUNT only. A 'hop' has no authored length or duration. */
export function minimumHopPath(graph,from,to) {
  const adj=adjacency(graph);
  if(!adj.has(from)||!adj.has(to))return null;
  if(from===to)return {nodes:[from],routes:[],hops:0};
  const seen=new Set([from]),prev=new Map(),queue=[from];
  for(let i=0;i<queue.length;i++){
    const current=queue[i];
    for(const link of adj.get(current)){
      if(seen.has(link.node))continue;
      seen.add(link.node);prev.set(link.node,{node:current,edge:link.edge});queue.push(link.node);
      if(link.node===to){
        const nodes=[to],routes=[];let cursor=to;
        while(cursor!==from){const step=prev.get(cursor);routes.push(step.edge);nodes.push(step.node);cursor=step.node;}
        nodes.reverse();routes.reverse();return {nodes,routes,hops:routes.length};
      }
    }
  }
  return null;
}

/** True single-corridor cut edges, even in the presence of parallel lanes. */
export function networkBridges(graph) {
  const adj=adjacency(graph),tin=new Map(),low=new Map(),bridges=[],timer={value:0};
  const visit=(id,parentEdge=null)=>{
    tin.set(id,timer.value);low.set(id,timer.value++);
    for(const link of adj.get(id)){
      if(link.edge===parentEdge)continue;
      if(tin.has(link.node))low.set(id,Math.min(low.get(id),tin.get(link.node)));
      else {
        visit(link.node,link.edge);
        low.set(id,Math.min(low.get(id),low.get(link.node)));
        if(low.get(link.node)>tin.get(id))bridges.push(link.edge);
      }
    }
  };
  for(const id of [...adj.keys()].sort())if(!tin.has(id))visit(id);
  return bridges.sort();
}

/** Statistical topology only: no claims about travel speed or access rights. */
export function networkReport(graph) {
  const components=networkComponents(graph),bridges=networkBridges(graph),degree=new Map(graph.nodes.map(n=>[n.id,0]));
  for(const edge of graph.edges){degree.set(edge.from,degree.get(edge.from)+1);degree.set(edge.to,degree.get(edge.to)+1);}
  const isolated=[...degree].filter(([,count])=>count===0).map(([id])=>id).sort();
  return {
    nodeCount:graph.nodes.length, corridorCount:graph.edges.length,
    componentCount:components.length, components, isolated,
    bridgeIds:bridges, bridgeCount:bridges.length,
    mostConnected:[...degree].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
      .slice(0,5).map(([id,count])=>({id,corridors:count})),
  };
}

/** Recompute against a closure set without changing the saved atlas. */
export function closureImpact(state,view,kind='all',closed=[]) {
  const before=networkReport(draftNetwork(state,view,{kind}));
  const after=networkReport(draftNetwork(state,view,{kind,closed}));
  return {before,after,addedComponents:after.componentCount-before.componentCount,
    newlyIsolated:after.isolated.filter(id=>!before.isolated.includes(id))};
}
