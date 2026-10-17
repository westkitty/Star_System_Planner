/** Documented relationship explorer. Topology is not metric cartography. */
import { TOPOLOGY, conceptualLayout, linksForNode, validateSourceTopology } from './source-topology.js';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
const SVG_NS='http://www.w3.org/2000/svg';
const svg=(tag,attrs)=>{const node=document.createElementNS(SVG_NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));return node;};
const makeSourceLink=(url,label)=>{const a=el('a','source-citation',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};

export function initSourceGraph(){
  const failures=validateSourceTopology();
  if(failures.length)throw new Error('WorldsVault snapshot rejected: '+failures.join('; '));
  const dialog=$('sourceGraphDialog');if(!dialog)throw new Error('Source graph dialog missing');
  const board=$('sourceGraphBoard'), nodesRoot=$('sourceGraphNodes'), relationships=$('sourceGraphRelations'), details=$('sourceGraphDetails');
  const search=$('sourceGraphSearch');const positions=conceptualLayout();
  let selected='worldsvault';
  const coord=new Map(positions.map(n=>[n.id,n]));
  const lineLayer=svg('svg',{viewBox:'0 0 1240 490',width:1240,height:490,'aria-hidden':'true'});
  const defs=svg('defs',{});const marker=svg('marker',{id:'relation-arrow',markerWidth:7,markerHeight:7,refX:6,refY:3,orient:'auto'});
  marker.append(svg('path',{d:'M 0 0 L 6 3 L 0 6',fill:'none',stroke:'#68d8f7','stroke-width':1.2}));defs.append(marker);lineLayer.append(defs);
  for(const group of TOPOLOGY.groups){const col=TOPOLOGY.groups.findIndex(g=>g.id===group.id);const h=svg('text',{x:120+col*234,y:53,'text-anchor':'middle',class:'source-group-caption'});h.textContent=group.name;lineLayer.append(h);}
  for(const link of TOPOLOGY.edges){const a=coord.get(link.from),b=coord.get(link.to);
    const x=a.diagramX+92,y1=a.diagramY+17,y2=b.diagramY+17;
    const curve=svg('path',{d:`M ${x} ${y1} C ${x+49} ${y1} ${x+49} ${y2} ${x} ${y2}`,
      class:'source-edge', 'marker-end':'url(#relation-arrow)','data-from':link.from,'data-to':link.to});
    lineLayer.append(curve);
    const label=svg('text',{x:x+49,y:(y1+y2)/2-9,'text-anchor':'middle',class:'source-edge-title'});label.textContent=link.relation.toUpperCase();lineLayer.append(label);
  }
  board.prepend(lineLayer);
  const btns=new Map();
  for(const n of positions){
    const b=el('button','source-graph-node');b.type='button';b.style.left=(n.diagramX-83)+'px';b.style.top=(n.diagramY-24)+'px';
    b.dataset.sourceId=n.id;
    const tiny=el('span','source-node-type',n.kind.replaceAll('-',' / '));
    const label=el('strong','',n.label);b.append(tiny,label);
    b.title=n.label+' / published relationship record / no authored coordinates';
    b.addEventListener('click',()=>select(n.id));nodesRoot.append(b);btns.set(n.id,b);
  }
  const renderRelations=()=>{
    const frag=document.createDocumentFragment();
    for(const edge of TOPOLOGY.edges){
      const left=TOPOLOGY.nodes.find(n=>n.id===edge.from),right=TOPOLOGY.nodes.find(n=>n.id===edge.to);
      const b=el('button','source-relation');b.type='button';b.dataset.linked=[edge.from,edge.to].join(' ');
      b.append(el('strong','',left.label),el('span','',edge.relation+' → '+right.label));
      b.addEventListener('click',()=>select(edge.from));frag.append(b);
    }
    relationships.replaceChildren(frag);
  };
  renderRelations();
  function select(id){
    const n=TOPOLOGY.nodes.find(n=>n.id===id);if(!n)return;
    selected=id;
    for(const [other,b] of btns)b.classList.toggle('active',other===id);
    details.replaceChildren(
      el('div','source-eyebrow','SOURCE IDENTITY / '+n.kind.toUpperCase()),
      el('h3','',n.label),
      el('p','source-warning',TOPOLOGY.disclaimer),
      el('p','source-id','GRAPH ID / '+n.id+'   ·   CANON STATUS / '+n.canonStatus.toUpperCase()),
      makeSourceLink(n.graphUrl,'OPEN PUBLISHED GRAPH RECORD ↗'),
      makeSourceLink(n.sourceUrl,'OPEN AUTHORED EVIDENCE ↗')
    );
    const matches=linksForNode(id);
    if(!matches.length)details.append(el('p','source-caveat','No published relationship edge is listed for this node. Nothing further should be inferred.'));
    for(const edge of matches){
      const other=TOPOLOGY.nodes.find(n=>n.id===(edge.from===id?edge.to:edge.from));
      const row=el('div','source-linked-edge');
      row.append(el('span','source-evidence-chip','DIRECT-AUTHORED '+edge.relation.toUpperCase()),
        el('span','',(edge.from===id?'→ ':'← ')+other.label),makeSourceLink(edge.graphUrl,'EVIDENCE ↗'));
      details.append(row);
    }
    for(const line of lineLayer.querySelectorAll('.source-edge'))line.classList.toggle('active',line.getAttribute('data-from')===id||line.getAttribute('data-to')===id);
    for(const b of relationships.children)b.classList.toggle('active',b.dataset.linked?.split(' ').includes(id));
  }
  function filter(){const q=search.value.trim().toLowerCase();for(const [id,b] of btns){const n=TOPOLOGY.nodes.find(x=>x.id===id);b.classList.toggle('dimmed',!!q&&!([n.label,n.kind,n.id].some(v=>v.toLowerCase().includes(q))));}}
  search.addEventListener('input',filter);
  $('sourceGraphOpen').addEventListener('click',()=>{dialog.showModal();select(selected);});
  $('sourceGraphClose').addEventListener('click',()=>dialog.close());
  select(selected);
  return {sourceSha:TOPOLOGY.sourceSha,open:()=>dialog.showModal()};
}
