import * as THREE from 'three';
import {draftNetwork,minimumHopPath,networkReport,closureImpact,NETWORK_KINDS} from './network-analysis.js';
import {validateCorridor} from './studio-math.js';

const svgNS='http://www.w3.org/2000/svg';
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const svg=(tag,cls)=>{const n=document.createElementNS(svgNS,tag);if(cls)n.setAttribute('class',cls);return n;};

/**
 * Pure read-side graph + transient DOM/SVG projection, no extra renderer/RAF.
 * The Atlas owns actual draft edits, Undo and JSON persistence. Closures and
 * paths here are analysis-only until the user explicitly commits a draft link.
 */
export class NetworkLab {
  constructor({canvas,atlas,panel,getState,getView,onCommit,message,isOtherEditorActive=()=>false}) {
    Object.assign(this,{canvas,atlas,panel,getState,getView,onCommit,message,isOtherEditorActive});
    this.$=id=>panel.querySelector('#'+id);
    this.opened=false;this.engine=null;this.kind='all';this.from=null;this.to=null;
    this.tierKey=null;this.closed=new Set();this.currentPath=null;
    this.overlay=svg('svg','network-path-overlay');this.overlay.id='networkPathOverlay';
    this.overlay.setAttribute('aria-hidden','true');this.overlay.hidden=true;
    canvas.parentElement.append(this.overlay);
    this.listeners=new AbortController();const signal=this.listeners.signal;
    this.$('networkClose').addEventListener('click',()=>this.close(),{signal});
    this.$('networkKind').addEventListener('change',e=>{this.kind=e.target.value;this.sync();},{signal});
    this.$('networkFrom').addEventListener('change',e=>{this.from=e.target.value;this.refresh();},{signal});
    this.$('networkTo').addEventListener('change',e=>{this.to=e.target.value;this.refresh();},{signal});
    this.$('networkTrace').addEventListener('click',()=>this.refresh(true),{signal});
    this.$('networkReset').addEventListener('click',()=>{this.closed.clear();this.sync();this.message('Temporary route closures cleared.');},{signal});
    this.$('networkCommit').addEventListener('click',()=>this.commitLink(),{signal});
    this.$('networkNewKind').addEventListener('change',()=>this.refresh(),{signal});
    this._resize=()=>this.projectOverlay();window.addEventListener('resize',this._resize,{signal});
    this.panel.hidden=true;
  }
  attachEngine(engine){
    if(this.engine&&this._onCamera)this.engine.controls.removeEventListener('change',this._onCamera);
    this.engine=engine;this._onCamera=()=>this.projectOverlay();
    engine.controls.addEventListener('change',this._onCamera);
    this.sync();
  }
  open(){if(!this.engine||this.opened)return;this.opened=true;this.panel.hidden=false;
    this.atlas.classList.add('network-open');this.engine.paused=true;this.sync();
    this.$('networkFrom').focus({preventScroll:true});
  }
  close(){if(!this.opened)return;this.opened=false;this.panel.hidden=true;
    this.atlas.classList.remove('network-open');this.overlay.hidden=true;this.overlay.replaceChildren();
    if(this.engine)this.engine.paused=document.hidden||this.isOtherEditorActive();
  }
  currentTier(){const v=this.getView();return `${v.kind}:${v.id??'all'}`;}
  sync(){
    if(!this.engine)return;
    const key=this.currentTier();if(this.tierKey!==key){this.closed.clear();this.from=null;this.to=null;this.tierKey=key;}
    const graph=draftNetwork(this.getState(),this.getView(),{kind:this.kind,closed:[...this.closed]});
    const ids=new Set(graph.nodes.map(n=>n.id));
    if(!ids.has(this.from))this.from=graph.nodes[0]?.id??null;
    if(!ids.has(this.to))this.to=graph.nodes.at(-1)?.id??null;
    this.$('networkKind').value=this.kind;
    this.$('networkTier').textContent=this.getView().kind==='all'?'ALL / GALAXIES':this.getView().kind==='galaxy'?'GALAXY / SYSTEMS':'SYSTEM / PLANETS';
    for(const [el,id] of [[this.$('networkFrom'),this.from],[this.$('networkTo'),this.to]]){
      const list=document.createDocumentFragment();for(const n of graph.nodes){const o=make('option','',n.name);o.value=n.id;list.append(o);}
      el.replaceChildren(list);el.value=id??'';el.disabled=!graph.nodes.length;
    }
    this.renderClosureList();this.refresh();
  }
  renderClosureList(){
    const graph=draftNetwork(this.getState(),this.getView(),{kind:this.kind});
    const names=new Map(graph.nodes.map(n=>[n.id,n.name]));const frag=document.createDocumentFragment();
    for(const edge of graph.edges){
      const row=make('label','network-closure-item');row.dataset.routeId=edge.id;
      const checkbox=make('input');checkbox.type='checkbox';checkbox.checked=this.closed.has(edge.id);
      checkbox.setAttribute('aria-label',`Simulate closing ${names.get(edge.from)} to ${names.get(edge.to)}`);
      checkbox.addEventListener('change',()=>{
        checkbox.checked?this.closed.add(edge.id):this.closed.delete(edge.id);
        this.refresh();
      },{signal:this.listeners.signal});
      const caption=make('span','',`${names.get(edge.from)} / ${names.get(edge.to)}`);
      const type=make('small','',edge.kind==='starsilk'?'AZURE':'HOOKSHOT');
      row.append(checkbox,caption,type);frag.append(row);
    }
    if(!graph.edges.length)frag.append(make('p','network-empty','No drafted corridors at this scale for the chosen filter.'));
    this.$('networkRouteList').replaceChildren(frag);
  }
  refresh(announce=false){
    if(!this.engine)return;
    const state=this.getState(),view=this.getView(),graph=draftNetwork(state,view,{kind:this.kind,closed:[...this.closed]});
    const report=networkReport(graph),impact=closureImpact(state,view,this.kind,[...this.closed]);
    const names=new Map(graph.nodes.map(n=>[n.id,n.name]));
    this.$('networkNodes').textContent=String(report.nodeCount);
    this.$('networkLinks').textContent=String(report.corridorCount);
    this.$('networkIslands').textContent=String(report.componentCount);
    this.$('networkBridgesCount').textContent=String(report.bridgeCount);
    this.$('networkOutageInfo').textContent=this.closed.size
      ? `${this.closed.size} temporarily closed / +${impact.addedComponents} disconnected clusters / ${impact.newlyIsolated.length} newly isolated draft objects`
      : 'All saved draft corridors active. Outage switches are temporary.';
    const bridges=new Map(draftNetwork(state,view,{kind:this.kind}).edges.map(e=>[e.id,e]));
    const frag=document.createDocumentFragment();for(const id of report.bridgeIds.slice(0,24)){
      const edge=bridges.get(id);if(edge)frag.append(make('li','',`${names.get(edge.from)} / ${names.get(edge.to)}`));
    }
    if(!report.bridgeIds.length)frag.append(make('li','','No single-corridor cut edges in the active graph.'));
    this.$('networkBridgeList').replaceChildren(frag);
    this.currentPath=minimumHopPath(graph,this.from,this.to);
    const pathEl=this.$('networkPath');
    if(!this.from||!this.to){pathEl.textContent='No two draft objects are available at this tier.';}
    else if(!this.currentPath){pathEl.textContent='NO CONNECTED DRAFT CORRIDOR / Hypothetical network only.';}
    else {
      const steps=this.currentPath.nodes.map(id=>names.get(id)||id);
      pathEl.textContent=`${this.currentPath.hops} HOPS / ${steps.join(' > ')}`;
    }
    this.$('networkCommit').disabled=!!validateCorridor(state,this.from,this.to)||!this.from||!this.to;
    this.projectOverlay();
    if(announce){this.message(this.currentPath?`Draft route traced: ${this.currentPath.hops} corridors (no real-world travel metrics).`:'There is no active draft path between those objects.');}
  }
  commitLink(){
    const reason=validateCorridor(this.getState(),this.from,this.to);
    if(reason){this.message(reason,true);this.refresh();return;}
    const kind=this.$('networkNewKind').value;
    if(!['hookshot','starsilk'].includes(kind))return;
    if(this.onCommit({from:this.from,to:this.to,kind})){
      this.message('New draft corridor committed. This is not a canonical transit link.');
      this.sync();
    }
  }
  screenOf(id){const engine=this.engine;if(!engine)return null;
    const item=engine.labelItems.find(x=>x.node.id===id);if(!item)return null;
    engine.camera.updateMatrixWorld();item.obj.updateWorldMatrix(true,false);
    const pos=new THREE.Vector3();item.obj.getWorldPosition(pos);pos.project(engine.camera);
    if(pos.z<-1||pos.z>1||!Number.isFinite(pos.x)||!Number.isFinite(pos.y)||Math.abs(pos.x)>1.2||Math.abs(pos.y)>1.2)return null;
    const rect=this.canvas.getBoundingClientRect();return {x:(pos.x*.5+.5)*rect.width,y:(-pos.y*.5+.5)*rect.height};
  }
  projectOverlay(){
    this.overlay.replaceChildren();this.overlay.hidden=true;
    if(!this.opened||!this.currentPath||!this.engine||this.currentPath.nodes.length<2)return;
    const rect=this.canvas.getBoundingClientRect();if(rect.width<10||rect.height<10)return;
    this.overlay.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);
    const path=this.currentPath.nodes.map(id=>this.screenOf(id));if(path.some(p=>!p))return;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2-22;
      const line=svg('path','network-highlight-line');line.setAttribute('d',`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`);
      this.overlay.append(line);
    }
    for(const [i,p] of path.entries()){
      const circle=svg('circle','network-highlight-node');circle.setAttribute('cx',String(p.x));circle.setAttribute('cy',String(p.y));
      circle.setAttribute('r',i===0||i===path.length-1?'7':'4');this.overlay.append(circle);
    }
    this.overlay.hidden=false;
  }
  dispose(){this.close();this.listeners.abort();if(this.engine&&this._onCamera)this.engine.controls.removeEventListener('change',this._onCamera);this.overlay.remove();}
}
