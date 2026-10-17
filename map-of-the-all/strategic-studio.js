import * as THREE from 'three';
import {eligibleGroup,translatedGroup,regionFromGroup,validatePolygon,regionReport,pointInPolygon,MAX_REGIONS,MAX_VERTICES} from './strategic-model.js';

/**
 * Phase 4: one bounded 3D editorial inspector. Main.js alone owns state/Undo;
 * AtlasEngine alone owns the WebGL loop. All transform/shape previews are transient.
 */
export class StrategicStudio {
  constructor({canvas,atlas,panel,labelsRoot,getState,getView,onChange,onMessage}) {
    Object.assign(this,{canvas,atlas,panel,labelsRoot,getState,getView,onChange,onMessage});
    this.engine=null;this.mode='group';this.opened=false;this.groupIds=[];this.regionId=null;
    this.gesture=null;this.dragVertices=null;this.drawing=false;this.drawingPoints=[];this.pointer=null;
    this.$=id=>panel.querySelector('#'+id);
    this.selectHandle=document.createElement('button');this.selectHandle.id='strategyGroupHandle';
    this.selectHandle.className='strategy-group-handle';this.selectHandle.type='button';this.selectHandle.setAttribute('aria-label','Drag selected draft objects together');
    this.selectHandle.title='Move entire selected draft group in one undoable action';this.selectHandle.textContent='✥';
    this.selectHandle.hidden=true;canvas.parentElement.append(this.selectHandle);
    this.vertexLayer=document.createElement('div');this.vertexLayer.id='strategyVertexLayer';this.vertexLayer.className='strategy-vertex-layer';
    canvas.parentElement.append(this.vertexLayer);
    this.overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');this.overlay.id='strategyGuides';this.overlay.classList.add('strategy-guides');
    this.overlay.setAttribute('aria-hidden','true');canvas.parentElement.append(this.overlay);
    this.readout=document.createElement('output');this.readout.className='strategy-gesture-readout';this.readout.hidden=true;canvas.parentElement.append(this.readout);
    this.$('strategyClose').addEventListener('click',()=>this.close());
    for(const key of ['group','region','pan'])this.$('strategyMode'+key[0].toUpperCase()+key.slice(1)).addEventListener('click',()=>this.setMode(key));
    this.$('strategySelectAll').addEventListener('click',()=>this.selectAll());
    this.$('strategyClear').addEventListener('click',()=>this.applyGroup([]));
    this.$('strategyGroupAxis').addEventListener('change',()=>this.cancelGesture());
    this.$('strategyGroupSnap').addEventListener('change',()=>this.cancelGesture());
    for(const [id,delta] of [['strategyNudgeLeft',[-1,0,0]],['strategyNudgeRight',[1,0,0]],['strategyNudgeUp',[0,0,-1]],['strategyNudgeDown',[0,0,1]],['strategyNudgeHeight',[0,1,0]]]){
      this.$(id).addEventListener('click',()=>this.commitGroupDelta(delta));
    }
    this.$('strategyFromGroup').addEventListener('click',()=>this.createFromGroup());
    this.$('strategyStartDraw').addEventListener('click',()=>this.startDrawing());
    this.$('strategyFinishDraw').addEventListener('click',()=>this.finishDrawing());
    this.$('strategyCancelDraw').addEventListener('click',()=>this.cancelDrawing());
    this.$('strategyRegionForm').addEventListener('submit',e=>this.saveRegion(e));
    this.$('strategyAddVertex').addEventListener('click',()=>this.addVertex());
    this.$('strategyDeleteRegion').addEventListener('click',()=>this.deleteRegion());
    this.selectHandle.addEventListener('pointerdown',e=>this.startGroupDrag(e));
    this.selectHandle.addEventListener('pointermove',e=>this.moveGroupDrag(e));
    this.selectHandle.addEventListener('pointerup',e=>this.endGroupDrag(e));
    this.selectHandle.addEventListener('pointercancel',()=>this.cancelGesture());
    // Listen on the canvas after the existing engine. The editor intercepts selection in main.js.
    this.canvas.addEventListener('pointerdown',this._down=e=>this.canvasDown(e));
    this.canvas.addEventListener('pointermove',this._move=e=>this.canvasMove(e));
    this.canvas.addEventListener('pointerup',this._up=e=>this.canvasUp(e));
    this.canvas.addEventListener('pointercancel',this._cancel=()=>this.cancelGesture());
    this._resize=()=>this.updateGuides();window.addEventListener('resize',this._resize);
    this._keys=e=>{if(!this.opened||e.target.closest('input,textarea,select')||e.ctrlKey||e.metaKey)return;
      if(e.key==='Escape'&&(this.drawing||this.gesture||this.dragVertices)){this.cancelDrawing();this.cancelGesture();e.preventDefault();e.stopImmediatePropagation();}
    };document.addEventListener('keydown',this._keys,true);
    this.setMode('group');this.close();
  }
  attachEngine(engine){
    if(this.engine&&this._onCamera)this.engine.controls.removeEventListener('change',this._onCamera);
    this.engine=engine;this._onCamera=()=>this.updateGuides();engine.controls.addEventListener('change',this._onCamera);
    this.sync();
  }
  open(){if(this.opened)return;this.opened=true;this.panel.hidden=false;this.atlas.classList.add('strategic-open');this.setMode('group');this.sync();}
  close(){this.cancelGesture();this.cancelDrawing();this.opened=false;this.panel.hidden=true;this.atlas.classList.remove('strategic-open');this.selectHandle.hidden=true;this.vertexLayer.replaceChildren();this.overlay.replaceChildren();if(this.engine){this.engine.controls.enabled=true;this.engine.paused=document.hidden;}this.regionId=null;this.groupIds=[];}
  setMode(mode){if(!['group','region','pan'].includes(mode))return;
    this.cancelGesture();this.cancelDrawing();this.mode=mode;
    for(const key of ['group','region','pan'])this.$('strategyMode'+key[0].toUpperCase()+key.slice(1)).setAttribute('aria-pressed',String(key===mode));
    this.$('strategyGroupTools').hidden=mode!=='group';this.$('strategyRegionTools').hidden=mode!=='region';
    if(this.engine){this.engine.controls.enabled=mode==='pan'||!this.opened;this.engine.paused=!!(this.opened&&mode!=='pan'||document.hidden);}
    this.updateGuides();this.sync();
  }
  eligibleVisible(){const s=this.getState(),view=this.getView(),parent=view.kind==='all'?null:view.id;
    const type=view.kind==='all'?'galaxy':view.kind==='galaxy'?'system':'planet';
    return s.nodes.filter(n=>n.status==='draft'&&n.kind===type&&n.parentId===parent);
  }
  consumeSelect(id,ev){if(!this.opened)return false;
    if(this.mode==='region')return true;
    if(this.mode!=='group')return false;
    const n=this.eligibleVisible().find(n=>n.id===id);
    if(!n){this.onMessage('Only editable objects of the current tier can join a group.',true);return true;}
    const additive=!!(ev?.shiftKey||ev?.ctrlKey||ev?.metaKey);
    const next=additive?[...this.groupIds]:[];
    if(next.includes(id))next.splice(next.indexOf(id),1);else next.push(id);
    this.applyGroup(next);return true;
  }
  applyGroup(ids){const limited=ids.slice(0,32),eligible=this.eligibleVisible();this.groupIds=limited.filter(id=>eligible.some(n=>n.id===id));this.syncSelection();this.updateGuides();}
  selectAll(){this.applyGroup(this.eligibleVisible().slice(0,32).map(n=>n.id));}
  syncSelection(){
    this.$('strategyCount').textContent=String(this.groupIds.length);
    this.$('strategyFromGroup').disabled=!this.groupIds.length||this.getState().regions?.length>=MAX_REGIONS;
    const selected=new Set(this.groupIds);
    for(const btn of document.querySelectorAll('.node-btn')){const id=btn.dataset.atlasId;btn.classList.toggle('strategy-selected',selected.has(id));btn.setAttribute('aria-pressed',String(selected.has(id)));}
    for(const label of this.labelsRoot.querySelectorAll('.world-label'))label.classList.toggle('strategy-selected',selected.has(label.dataset.atlasId));
    const count=this.groupIds.length;
    this.$('strategyGroupSummary').textContent=count?`${count} draft object${count===1?'':'s'} / one bounded translation / one undo`:'Click markers, Shift-click to add, or drag a selection marquee.';
    for(const id of ['strategyNudgeLeft','strategyNudgeRight','strategyNudgeUp','strategyNudgeDown','strategyNudgeHeight'])this.$(id).disabled=!count;
  }
  sync(){
    if(!this.engine)return;
    const visible=new Set(this.eligibleVisible().map(n=>n.id));
    this.groupIds=this.groupIds.filter(id=>visible.has(id));
    if(this.regionId&&!this.visibleRegions().some(r=>r.id===this.regionId))this.regionId=null;
    this.syncSelection();this.renderRegions();this.renderRegionList();this.fillRegion();this.updateGuides();
  }
  visibleRegions(){const id=this.getView().kind==='all'?null:this.getView().id;
    if(this.getView().kind==='system')return [];
    return (this.getState().regions||[]).filter(r=>r.parentId===id);
  }
  project(p){if(!this.engine)return null;
    this.engine.camera.updateMatrixWorld();const vector=new THREE.Vector3(...p).project(this.engine.camera);
    if(!Number.isFinite(vector.x)||vector.z<-1||vector.z>1)return null;
    const rect=this.canvas.getBoundingClientRect();return {x:(vector.x*.5+.5)*rect.width,y:(-vector.y*.5+.5)*rect.height};
  }
  pickPlane(e,y){const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height||!this.engine)return null;
    const xy=new THREE.Vector2((e.clientX-rect.left)*2/rect.width-1,1-(e.clientY-rect.top)*2/rect.height);
    this.engine.camera.updateMatrixWorld();const caster=new THREE.Raycaster();caster.setFromCamera(xy,this.engine.camera);
    return caster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());
  }
  planeY(){return this.getView().kind==='all'?-10:-4;}
  groupCentre(){const valid=this.eligibleVisible(),chosen=this.groupIds.map(id=>valid.find(n=>n.id===id)).filter(Boolean);if(!chosen.length)return null;
    return chosen.reduce((p,n)=>p.map((x,i)=>x+n.position[i]/chosen.length),[0,0,0]);
  }
  updateGuides(){
    this.selectHandle.hidden=true;this.vertexLayer.replaceChildren();this.overlay.replaceChildren();
    if(!this.opened||!this.engine)return;
    if(this.mode==='group'){
      const centre=this.groupCentre(),p=centre&&this.project(centre);
      if(p){this.selectHandle.hidden=false;this.selectHandle.style.left=p.x+'px';this.selectHandle.style.top=p.y+'px';}
      if(this.gesture?.type==='marquee'){const d=this.gesture;const b=document.createElementNS('http://www.w3.org/2000/svg','rect');
        b.setAttribute('x',String(Math.min(d.start[0],d.current[0])));b.setAttribute('y',String(Math.min(d.start[1],d.current[1])));
        b.setAttribute('width',String(Math.abs(d.start[0]-d.current[0])));b.setAttribute('height',String(Math.abs(d.start[1]-d.current[1])));
        b.setAttribute('class','strategy-marquee');this.overlay.append(b);}
    }
    if(this.mode!=='region')return;
    const region=this.visibleRegions().find(r=>r.id===this.regionId);
    const pts=this.drawing?this.drawingPoints:this.dragVertices?.candidate||region?.points;
    if(pts?.length){const svg=document.createElementNS('http://www.w3.org/2000/svg',pts.length>=3?'polygon':'polyline');
      svg.setAttribute('points',pts.map(p=>this.project([p[0],this.planeY(),p[1]])).filter(Boolean).map(p=>p.x+','+p.y).join(' '));
      svg.setAttribute('class',this.drawing?'strategy-draw-preview':'strategy-region-guides');this.overlay.append(svg);}
    if(!region||this.drawing)return;
    region.points.forEach((point,i)=>{
      const pos=this.project([point[0],this.planeY(),point[1]]);if(!pos)return;
      const h=document.createElement('button');h.type='button';h.className='strategy-vertex';h.textContent=String(i+1);h.title='Drag region vertex '+(i+1);
      h.style.left=pos.x+'px';h.style.top=pos.y+'px';h.dataset.vertexIndex=String(i);
      h.setAttribute('aria-label','Drag vertex '+(i+1));
      h.addEventListener('pointerdown',e=>this.vertexDown(e,i));h.addEventListener('pointermove',e=>this.vertexMove(e));
      h.addEventListener('pointerup',e=>this.vertexUp(e));h.addEventListener('pointercancel',()=>this.cancelGesture());
      this.vertexLayer.append(h);
    });
  }
  renderRegions(){
    if(!this.engine)return;
    if(this.regionGroup){if(this.regionGroup.parent)this.regionGroup.parent.remove(this.regionGroup);
      this.regionGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.regionGroup=null;}
    if(!this.getState().layers.territories)return;
    const regions=this.visibleRegions();if(!regions.length)return;
    const group=new THREE.Group();group.name='editorial-draft-regions';group.renderOrder=-1;this.regionGroup=group;
    for(const r of regions){
      if(r.points.length<3)continue;
      const shape=new THREE.Shape();shape.moveTo(r.points[0][0],-r.points[0][1]);
      for(const [x,z] of r.points.slice(1))shape.lineTo(x,-z);shape.closePath();
      const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
      const fill=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:r.color,side:THREE.DoubleSide,transparent:true,opacity:r.id===this.regionId?.21:.10,depthWrite:false,depthTest:true}));
      fill.position.y=this.planeY();fill.renderOrder=-1;group.add(fill);
      const coords=r.points.map(([x,z])=>new THREE.Vector3(x,this.planeY()+.08,z));coords.push(coords[0].clone());
      const border=new THREE.Line(new THREE.BufferGeometry().setFromPoints(coords),new THREE.LineBasicMaterial({color:r.color,transparent:true,opacity:r.id===this.regionId?.97:.7,depthWrite:false}));
      border.renderOrder=1;group.add(border);
    }
    this.engine.group.add(group);
  }
  renderRegionList(){const box=this.$('strategyRegionList'),frag=document.createDocumentFragment();
    for(const r of this.visibleRegions()){
      const b=document.createElement('button');b.type='button';b.className='strategy-sector-row';b.dataset.regionId=r.id;
      b.classList.toggle('active',r.id===this.regionId);b.textContent=r.name;
      b.title='Editable draft sector – no canonical jurisdiction';b.addEventListener('click',()=>this.selectRegion(r.id));frag.append(b);
    }
    if(!frag.childNodes.length){const span=document.createElement('p');span.textContent='No drafted survey sectors in this tier.';frag.append(span);}
    box.replaceChildren(frag);
  }
  selectRegion(id){this.cancelDrawing();this.cancelGesture();this.regionId=this.visibleRegions().find(r=>r.id===id)?.id||null;this.renderRegions();this.renderRegionList();this.fillRegion();this.updateGuides();}
  fillRegion(){const r=this.visibleRegions().find(x=>x.id===this.regionId);
    this.$('strategyRegionForm').hidden=!r;
    this.$('strategyRegionEmpty').hidden=!!r;
    if(!r)return;
    this.$('strategyRegionName').value=r.name;this.$('strategyRegionAffiliation').value=r.affiliation;
    this.$('strategyRegionColor').value=r.color;
    const list=this.$('strategyVertexList');const frag=document.createDocumentFragment();
    r.points.forEach((p,i)=>{const row=document.createElement('div');row.className='strategy-vertex-row';row.dataset.vertex=String(i);
      const label=document.createElement('span');label.textContent='V'+(i+1);
      for(const [coord,axis] of [[p[0],'x'],[p[1],'z']]){const input=document.createElement('input');input.type='number';input.step='any';input.min='-10000';input.max='10000';input.value=String(coord);input.required=true;input.dataset.axis=axis;input.setAttribute('aria-label','Vertex '+(i+1)+' '+axis.toUpperCase());row.append(input);}
      const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Remove this vertex';del.disabled=r.points.length<=3;
      del.addEventListener('click',()=>this.removeVertex(i));row.prepend(label);row.append(del);frag.append(row);
    });list.replaceChildren(frag);
    const report=regionReport(this.getState(),r);
    this.$('strategyRegionMetrics').textContent=`${report.count} nodes · ${report.internal} internal corridors · ${report.frontier} frontier links · ${report.displayArea.toFixed(1)} display²`;
  }
  readVertices(){return [...this.$('strategyVertexList').querySelectorAll('.strategy-vertex-row')].map(row=>[Number(row.querySelector('input[data-axis="x"]').value),Number(row.querySelector('input[data-axis="z"]').value)]);}
  saveRegion(e){e.preventDefault();const r=this.visibleRegions().find(x=>x.id===this.regionId);if(!r)return;
    const name=this.$('strategyRegionName').value.trim(),affiliation=this.$('strategyRegionAffiliation').value.trim(),color=this.$('strategyRegionColor').value;
    const points=this.readVertices(),failure=validatePolygon(points);
    if(failure){this.onMessage(failure,true);return;}
    if(!name||name.length>100||affiliation.length>100){this.onMessage('Invalid draft sector metadata.',true);return;}
    this.onChange(s=>{const item=s.regions.find(x=>x.id===r.id);Object.assign(item,{name,affiliation,color,points});});
    this.onMessage('Draft sector updated; one undo step.');
  }
  addVertex(){const r=this.visibleRegions().find(x=>x.id===this.regionId);if(!r||r.points.length>=MAX_VERTICES)return;
    const a=r.points[0],b=r.points[1];const point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    this.onChange(s=>{s.regions.find(x=>x.id===r.id).points.splice(1,0,point);});
  }
  removeVertex(index){const r=this.visibleRegions().find(x=>x.id===this.regionId);if(!r||r.points.length<=3)return;
    this.onChange(s=>{s.regions.find(x=>x.id===r.id).points.splice(index,1);});
  }
  deleteRegion(){const r=this.visibleRegions().find(x=>x.id===this.regionId);if(!r)return;
    if(!window.confirm('Delete this editorial draft sector? Undo restores it.'))return;
    this.onChange(s=>{s.regions=s.regions.filter(x=>x.id!==r.id);});this.regionId=null;this.sync();
  }
  createFromGroup(){try{
    const item=regionFromGroup(this.getState(),this.groupIds,this.getView());
    if(this.getState().regions?.length>=MAX_REGIONS)throw Error('Region limit reached');
    if(!this.onChange(s=>{(s.regions??=[]).push(item);}))return;this.setMode('region');this.selectRegion(item.id);
    this.onMessage('Draft survey boundary created from selected markers. No sovereign territory asserted.');
  }catch(e){this.onMessage(e.message,true);}}
  startDrawing(){if(this.getView().kind==='system'){this.onMessage('Region polygons are supported at cosmic and galactic scales.',true);return;}
    this.cancelGesture();this.drawing=true;this.drawingPoints=[];this.$('strategyFinishDraw').disabled=true;this.$('strategyDrawHint').textContent='Tap 3–24 vertices on the map. FINISH creates a draft polygon; CANCEL discards it.';
    this.updateGuides();
  }
  finishDrawing(){if(!this.drawing)return;const failure=validatePolygon(this.drawingPoints);if(failure){this.onMessage(failure,true);return;}
    if(this.getState().regions?.length>=MAX_REGIONS){this.onMessage('Region limit reached',true);return;}
    const used=new Set([...(this.getState().regions||[]).map(x=>x.id),...this.getState().nodes.map(x=>x.id)]);
    let id;do{id='survey-sector-'+Math.random().toString(36).slice(2,9);}while(used.has(id));
    const r={id,name:'NEW SURVEY SECTOR',affiliation:'UNASSIGNED / PROVISIONAL',parentId:this.getView().kind==='all'?null:this.getView().id,
      status:'draft',color:'#58ccf2',points:this.drawingPoints.map(p=>[...p])};
    this.cancelDrawing();if(!this.onChange(s=>{(s.regions??=[]).push(r);}))return;this.selectRegion(id);
    this.onMessage('Editorial polygon saved. No political claim made.');
  }
  cancelDrawing(){this.drawing=false;this.drawingPoints=[];this.$('strategyFinishDraw').disabled=true;
    this.$('strategyDrawHint').textContent='Draw a provisional boundary, or select one to edit its vertices.';this.updateGuides();}
  canvasDown(e){if(!this.opened||this.mode!=='group'||!e.isPrimary||e.button!==0)return;
    const r=this.canvas.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;
    this.gesture={type:'marquee',pointer:e.pointerId,start:[x,y],current:[x,y],moved:false,additive:!!e.shiftKey};
  }
  canvasMove(e){if(this.gesture?.type!=='marquee'||this.gesture.pointer!==e.pointerId)return;
    const r=this.canvas.getBoundingClientRect();this.gesture.current=[e.clientX-r.left,e.clientY-r.top];
    if(Math.hypot(this.gesture.current[0]-this.gesture.start[0],this.gesture.current[1]-this.gesture.start[1])>10)this.gesture.moved=true;
    if(this.gesture.moved){e.preventDefault();this.updateGuides();}
  }
  canvasUp(e){
    if(!this.opened)return;
    if(this.mode==='region'&&this.drawing&&e.isPrimary&&e.button===0){const pos=this.pickPlane(e,this.planeY());
      if(pos&&this.drawingPoints.length<MAX_VERTICES){this.drawingPoints.push([Math.min(10000,Math.max(-10000,pos.x)),Math.min(10000,Math.max(-10000,pos.z))]);
        this.$('strategyFinishDraw').disabled=this.drawingPoints.length<3;this.updateGuides();}return;}
    const d=this.gesture;if(d?.type!=='marquee'||d.pointer!==e.pointerId)return;this.gesture=null;
    if(d.moved){const x0=Math.min(d.start[0],d.current[0]),x1=Math.max(d.start[0],d.current[0]),y0=Math.min(d.start[1],d.current[1]),y1=Math.max(d.start[1],d.current[1]);
      const selected=this.eligibleVisible().filter(n=>{const p=this.project(n.position);return p&&p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1;}).map(n=>n.id);
      this.applyGroup(d.additive?[...new Set([...this.groupIds,...selected])]:selected);
      this.onMessage(selected.length+' editable marker(s) enclosed.');
    }
    this.updateGuides();
  }
  groupAxis(){return this.$('strategyGroupAxis').value;}
  groupSnap(){return Number(this.$('strategyGroupSnap').value);}
  commitGroupDelta(delta){if(!this.groupIds.length)return;
    try{const results=translatedGroup(this.getState(),this.groupIds,this.getView(),delta,this.groupSnap());
      if(results.every(u=>u.position.every((v,i)=>v===this.getState().nodes.find(n=>n.id===u.id).position[i])))return;
      this.onChange(s=>{for(const update of results)s.nodes.find(n=>n.id===update.id).position=update.position;});
      this.onMessage('Group translated in one undoable draft edit.');
    }catch(e){this.onMessage(e.message,true);}
  }
  startGroupDrag(e){if(!this.opened||this.mode!=='group'||!e.isPrimary||e.button!==0)return;
    const centre=this.groupCentre();if(!centre)return;
    const start=this.pickPlane(e,centre[1]);if(!start&&this.groupAxis()!=='y'){this.onMessage('Camera is parallel to the plane; switch to height axis.',true);return;}
    e.preventDefault();e.stopPropagation();this.gesture={type:'group',pointer:e.pointerId,centre,origin:[e.clientX,e.clientY],start,delta:[0,0,0],moved:false};
    this.engine.controls.enabled=false;this.selectHandle.setPointerCapture(e.pointerId);this.readout.hidden=false;
  }
  moveGroupDrag(e){const d=this.gesture;if(d?.type!=='group'||d.pointer!==e.pointerId)return;e.preventDefault();
    if(Math.hypot(e.clientX-d.origin[0],e.clientY-d.origin[1])<4)return;
    d.moved=true;
    if(this.groupAxis()==='y'){const distance=this.engine.camera.position.distanceTo(this.engine.controls.target);d.delta=[0,(d.origin[1]-e.clientY)*Math.max(.04,distance/460),0];}
    else {const next=this.pickPlane(e,d.centre[1]);if(!next)return;d.delta=[next.x-d.start.x,0,next.z-d.start.z];}
    const steps=this.groupSnap(),updates=translatedGroup(this.getState(),this.groupIds,this.getView(),d.delta,steps);
    const next=updates.reduce((p,u)=>p.map((v,i)=>v+u.position[i]/updates.length),[0,0,0]);
    const projection=this.project(next);if(projection){this.selectHandle.style.left=projection.x+'px';this.selectHandle.style.top=projection.y+'px';}
    this.readout.hidden=false;this.readout.textContent=`GROUP ${updates.length} / Δ ${d.delta.map(v=>v.toFixed(1)).join(' / ')} display units`;
  }
  endGroupDrag(e){const d=this.gesture;if(d?.type!=='group'||d.pointer!==e.pointerId)return;
    const delta=d.delta,moved=d.moved;this.cancelGesture();if(moved)this.commitGroupDelta(delta);
  }
  vertexDown(e,index){if(!this.opened||this.mode!=='region'||!e.isPrimary||e.button!==0)return;
    const r=this.visibleRegions().find(x=>x.id===this.regionId);if(!r)return;
    e.preventDefault();e.stopPropagation();this.dragVertices={pointer:e.pointerId,id:r.id,index,candidate:r.points.map(p=>[...p]),start:[e.clientX,e.clientY]};
    e.currentTarget.setPointerCapture(e.pointerId);if(this.engine)this.engine.controls.enabled=false;
  }
  vertexMove(e){const d=this.dragVertices;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();
    const p=this.pickPlane(e,this.planeY());if(!p)return;
    d.candidate[d.index]=[Math.max(-10000,Math.min(10000,p.x)),Math.max(-10000,Math.min(10000,p.z))];
    const screen=this.project([d.candidate[d.index][0],this.planeY(),d.candidate[d.index][1]]);
    if(screen){e.currentTarget.style.left=screen.x+'px';e.currentTarget.style.top=screen.y+'px';}
    this.updatePreviewOnly(d.candidate);
  }
  updatePreviewOnly(points){this.overlay.replaceChildren();const svg=document.createElementNS('http://www.w3.org/2000/svg','polygon');
    svg.setAttribute('points',points.map(p=>this.project([p[0],this.planeY(),p[1]])).filter(Boolean).map(p=>p.x+','+p.y).join(' '));
    svg.setAttribute('class','strategy-region-guides');this.overlay.append(svg);
  }
  vertexUp(e){const d=this.dragVertices;if(!d||d.pointer!==e.pointerId)return;
    const p=d.candidate,old=this.visibleRegions().find(x=>x.id===d.id)?.points;
    this.cancelGesture();const failure=validatePolygon(p);
    if(failure){this.onMessage('Vertex change refused: '+failure,true);return;}
    if(JSON.stringify(old)!==JSON.stringify(p)){this.onChange(s=>{s.regions.find(x=>x.id===d.id).points=p;});this.onMessage('Polygon vertex moved; undo available.');}
  }
  cancelGesture(){this.gesture=null;this.dragVertices=null;this.readout.hidden=true;
    try{if(this.selectHandle.hasPointerCapture?.(0))this.selectHandle.releasePointerCapture(0);}catch{}
    if(this.engine)this.engine.controls.enabled=!this.opened||this.mode==='pan';this.updateGuides();
  }
  dispose(){this.close();this.canvas.removeEventListener('pointerdown',this._down);this.canvas.removeEventListener('pointermove',this._move);
    this.canvas.removeEventListener('pointerup',this._up);this.canvas.removeEventListener('pointercancel',this._cancel);
    if(this.engine)this.engine.controls.removeEventListener('change',this._onCamera);
    window.removeEventListener('resize',this._resize);document.removeEventListener('keydown',this._keys,true);
    this.selectHandle.remove();this.vertexLayer.remove();this.overlay.remove();this.readout.remove();
    if(this.regionGroup){this.regionGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.regionGroup.removeFromParent();}}
}
