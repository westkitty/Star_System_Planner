import * as THREE from 'three';
import {EDIT_MODES, DISPLAY_LENSES, draftPosition, moveLabelOffset, validMoveTarget} from './studio-math.js';

/**
 * Spatial Studio owns ONLY the editing interaction and projected DOM handles.
 * The AtlasEngine still owns the sole WebGL/render loop; main.js still owns
 * authoritative state, Undo and persistence. All scene coordinates are drafts.
 */
export class SpatialStudio {
  constructor({canvas,labelsRoot,atlas,panel,getState,getView,onMove,onLabelCommit,onRouteCancel,onScale,onModeChange,message}) {
    Object.assign(this,{canvas,labelsRoot,atlas,panel,getState,getView,onMove,onLabelCommit,onRouteCancel,onScale,onModeChange,message});
    this.engine=null;this.mode='orbit';this.axis='xz';this.snap=0;this.routeFrom=null;
    this.drag=null;this.labelDrag=null;this.suppressClick=null;this.labelStyles=document.createElement('style');
    this.labelStyles.dataset.owner='starsilk-spatial-studio';document.head.append(this.labelStyles);
    this.handle=document.createElement('button');this.handle.id='studioMoveHandle';this.handle.type='button';
    this.handle.className='studio-handle';this.handle.setAttribute('aria-label','Drag selected draft object');
    this.handle.title='Drag this provisional object. Coordinate changes save only when released.';
    this.handle.hidden=true;this.handle.textContent='✣';this.canvas.parentElement.append(this.handle);
    this.ghost=document.createElement('output');this.ghost.id='studioGestureReadout';this.ghost.className='studio-gesture-readout';
    this.ghost.hidden=true;this.ghost.setAttribute('aria-live','off');this.canvas.parentElement.append(this.ghost);
    this.routeSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    this.routeSvg.classList.add('studio-route-preview');this.routeSvg.setAttribute('aria-hidden','true');
    this.routePath=document.createElementNS('http://www.w3.org/2000/svg','path');this.routeSvg.append(this.routePath);
    this.canvas.parentElement.append(this.routeSvg);
    this.modeButtons=[...panel.querySelectorAll('[data-studio-mode]')];
    for(const btn of this.modeButtons)btn.addEventListener('click',()=>this.setMode(btn.dataset.studioMode));
    panel.querySelector('#studioAxis').addEventListener('change',e=>{this.axis=e.target.value;this.cancel();});
    panel.querySelector('#studioSnap').addEventListener('change',e=>{this.snap=Number(e.target.value);this.cancel();});
    panel.querySelector('#studioLens').addEventListener('change',e=>this.setLens(e.target.value));
    panel.querySelector('#studioTypeScale').addEventListener('change',e=>onScale(Number(e.target.value)));
    panel.querySelector('#studioCancelRoute').addEventListener('click',()=>{this.routeFrom=null;this.onRouteCancel();this.updateRoute();this.message('Corridor drafting cancelled.');});
    panel.querySelector('#studioRouteKind').addEventListener('change',()=>this.updateRoute());
    this.handle.addEventListener('pointerdown',e=>this.onHandleDown(e));
    this.handle.addEventListener('pointermove',e=>this.onHandleMove(e));
    this.handle.addEventListener('pointerup',e=>this.onHandleEnd(e));
    this.handle.addEventListener('pointercancel',()=>this.cancel());
    this.labelsRoot.addEventListener('pointerdown',e=>this.onLabelDown(e),true);
    this.labelsRoot.addEventListener('pointermove',e=>this.onLabelPointerMove(e),true);
    this.labelsRoot.addEventListener('pointerup',e=>this.onLabelEnd(e),true);
    this.labelsRoot.addEventListener('pointercancel',()=>this.cancel(),true);
    this.labelsRoot.addEventListener('click',e=>this.onLabelClick(e),true);
    this.labelsRoot.addEventListener('dblclick',e=>{if(this.mode==='label'){e.stopImmediatePropagation();e.preventDefault();}},true);
    this.canvas.addEventListener('pointermove',e=>{if(this.mode==='route')this.updateRoute(e);});
    this.resizeHandler=()=>{this.updateHandle();this.updateRoute();};window.addEventListener('resize',this.resizeHandler);
    this.escapeHandler=e=>{if(e.key==='Escape'&&(this.drag||this.labelDrag||this.routeFrom)){
      e.preventDefault();e.stopImmediatePropagation();this.cancel();this.routeFrom=null;this.onRouteCancel();this.updateRoute();
    }};document.addEventListener('keydown',this.escapeHandler,true);
    this.prefsKey='starsilk.map-of-the-all.visual-lens.v1';
    let lens='survey';try{lens=localStorage.getItem(this.prefsKey)||lens;}catch{}
    this.setLens(DISPLAY_LENSES.includes(lens)?lens:'survey');
    this.sync();
  }
  attachEngine(engine){
    if(this.engine&&this.engineChange)this.engine.controls.removeEventListener('change',this.engineChange);
    this.engine=engine;
    this.engineChange=()=>{this.updateHandle();this.updateRoute();};
    engine.controls.addEventListener('change',this.engineChange);
    this.sync();
  }
  setMode(mode){
    if(!EDIT_MODES.includes(mode))return;
    this.cancel();this.routeFrom=null;this.mode=mode;
    this.panel.dataset.mode=mode;this.atlas.dataset.studioMode=mode;
    for(const b of this.modeButtons){const active=b.dataset.studioMode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
    this.panel.querySelector('#studioGestureHint').textContent={
      orbit:'ORBIT: DRAG SPACE / SELECT A MARKER',
      move:'MOVE: SELECT A DRAFT / DRAG ✣ HANDLE',
      route:'ROUTE: SELECT TWO DRAFT NODES IN THE SAME TIER',
      label:'TYPE: DRAG AN EDITABLE LABEL / ADJUST SCALE',
    }[mode];
    this.panel.querySelector('#studioMoveSettings').hidden=mode!=='move';
    this.panel.querySelector('#studioRouteSettings').hidden=mode!=='route';
    this.panel.querySelector('#studioTypeSettings').hidden=mode!=='label';
    if(this.engine)this.engine.paused=mode==='move'||mode==='label'||document.hidden;
    this.updateRoute();this.updateHandle();this.onModeChange(mode);
  }
  setLens(lens){if(!DISPLAY_LENSES.includes(lens))return;
    this.atlas.dataset.lens=lens;this.panel.querySelector('#studioLens').value=lens;
    try{localStorage.setItem(this.prefsKey,lens);}catch{}
  }
  sync(){
    this.renderLabelRules();
    this.panel.querySelector('#studioTypeScale').value=String(this.getState().typographyScale);
    this.panel.querySelector('#studioTypeScaleValue').textContent=(this.getState().typographyScale*100).toFixed(0)+'%';
    this.updateHandle();this.updateRoute();
  }
  renderLabelRules(){
    // IDs have already passed atlas-data's restrictive identifier validation.
    const rules=[];for(const n of this.getState().nodes){const offset=n.label?.offset;
      if(!offset||(!offset[0]&&!offset[1]))continue;
      rules.push(`.world-label[data-atlas-id="${n.id}"]{transform:translate(-50%,-50%) translate(${(offset[0]*100).toFixed(4)}vw,${(offset[1]*100).toFixed(4)}vh)}`);
    }
    this.labelStyles.textContent=rules.join('\n');
  }
  screenOf(id){const engine=this.engine;if(!engine)return null;
    const item=engine.labelItems.find(x=>x.node.id===id);if(!item)return null;
    engine.camera.updateMatrixWorld();item.obj.updateWorldMatrix(true,false);
    const p=new THREE.Vector3();item.obj.getWorldPosition(p);p.project(engine.camera);
    if(p.z<-1||p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1)return null;
    const r=this.canvas.getBoundingClientRect();return {x:(p.x*.5+.5)*r.width,y:(-p.y*.5+.5)*r.height};
  }
  updateHandle(){const n=this.getState().nodes.find(x=>x.id===this.getState().selected),allowed=this.mode==='move'&&validMoveTarget(n,this.getView());
    const p=allowed?this.screenOf(n.id):null;
    this.handle.hidden=!p;if(!p)return;
    if(!this.drag){this.handle.style.left=p.x+'px';this.handle.style.top=p.y+'px';}
    this.handle.dataset.atlasId=n.id;
    this.handle.title=`Drag ${n.name} (${this.axis.toUpperCase()}) — display units only`;
  }
  rayPoint(event,y){const engine=this.engine;if(!engine)return null;
    const rect=this.canvas.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    const mouse=new THREE.Vector2((event.clientX-rect.left)*2/rect.width-1,1-(event.clientY-rect.top)*2/rect.height);
    engine.camera.updateMatrixWorld();const ray=new THREE.Raycaster();ray.setFromCamera(mouse,engine.camera);
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-y);
    return ray.ray.intersectPlane(plane,new THREE.Vector3());
  }
  onHandleDown(e){
    if(this.mode!=='move'||!e.isPrimary||e.button!==0)return;
    const n=this.getState().nodes.find(x=>x.id===this.getState().selected);
    if(!validMoveTarget(n,this.getView()))return;
    const hit=this.rayPoint(e,n.position[1]);if(!hit){this.message('Tilt the map for horizontal movement, or choose Y axis.',true);return;}
    e.preventDefault();e.stopPropagation();
    this.drag={pointer:e.pointerId,id:n.id,origin:[...n.position],start:hit,client:[e.clientX,e.clientY],candidate:[...n.position],moved:false,controlsEnabled:this.engine.controls.enabled};
    this.engine.controls.enabled=false;
    this.handle.setPointerCapture(e.pointerId);this.handle.classList.add('dragging');this.ghost.hidden=false;
    this.updateMoveReadout(this.drag.candidate);
  }
  updateMoveReadout(coords){this.ghost.textContent=`DRAFT X ${coords[0].toFixed(2)} / Y ${coords[1].toFixed(2)} / Z ${coords[2].toFixed(2)}`;}
  onHandleMove(e){const d=this.drag;if(!d||d.pointer!==e.pointerId)return;e.preventDefault();
    const moved=Math.hypot(e.clientX-d.client[0],e.clientY-d.client[1]);if(moved>3)d.moved=true;
    if(!d.moved)return;
    let delta;
    if(this.axis==='y'){
      const distance=this.engine.camera.position.distanceTo(this.engine.controls.target);
      delta=[0,(d.client[1]-e.clientY)*Math.max(.04,distance/460),0];
    }else{
      const next=this.rayPoint(e,d.origin[1]);if(!next)return;
      delta=[next.x-d.start.x,0,next.z-d.start.z];
    }
    d.candidate=draftPosition(d.origin,delta,this.axis,this.snap);
    const rect=this.canvas.getBoundingClientRect();this.handle.style.left=Math.max(0,Math.min(rect.width,e.clientX-rect.left))+'px';
    this.handle.style.top=Math.max(0,Math.min(rect.height,e.clientY-rect.top))+'px';
    this.ghost.style.left=this.handle.style.left;this.ghost.style.top=this.handle.style.top;
    this.updateMoveReadout(d.candidate);
  }
  onHandleEnd(e){if(!this.drag||e.pointerId!==this.drag.pointer)return;
    const d=this.drag;this.cancel();
    if(d.moved&&d.candidate.some((v,i)=>Math.abs(v-d.origin[i])>1e-7))this.onMove(d.id,d.candidate);
  }
  onLabelDown(e){if(this.mode!=='label'||!e.isPrimary||e.button!==0)return;
    const button=e.target.closest?.('.world-label');if(!button)return;
    const id=button.dataset.atlasId,n=this.getState().nodes.find(x=>x.id===id);
    if(!validMoveTarget(n,this.getView()))return;
    e.stopPropagation();e.preventDefault();button.setPointerCapture(e.pointerId);
    this.labelDrag={pointer:e.pointerId,id,button,start:[e.clientX,e.clientY],offset:[...(n.label.offset||[0,0])],candidate:[...(n.label.offset||[0,0])],moved:false};
    button.classList.add('studio-label-dragging');
  }
  onLabelPointerMove(e){const d=this.labelDrag;if(!d||d.pointer!==e.pointerId)return;
    e.stopPropagation();e.preventDefault();
    const dx=e.clientX-d.start[0],dy=e.clientY-d.start[1];if(Math.hypot(dx,dy)>3)d.moved=true;
    if(!d.moved)return;
    const rect=this.canvas.getBoundingClientRect();
    d.candidate=moveLabelOffset(d.offset,dx,dy,rect.width,rect.height);
    d.button.style.transform=`translate(-50%,-50%) translate(${(d.candidate[0]*rect.width).toFixed(2)}px,${(d.candidate[1]*rect.height).toFixed(2)}px)`;
  }
  onLabelEnd(e){const d=this.labelDrag;if(!d||d.pointer!==e.pointerId)return;
    e.stopPropagation();e.preventDefault();
    this.suppressClick={id:d.id,expires:performance.now()+1200};
    this.cancel();
    if(d.moved&&d.candidate.some((v,i)=>Math.abs(v-d.offset[i])>1e-7))this.onLabelMoveCommit(d.id,d.candidate);
  }
  onLabelMoveCommit(id,offset){this.onLabelCommit(id,offset);}
  onLabelClick(e){const btn=e.target.closest?.('.world-label');if(!btn)return;
    if(this.mode==='label'||(this.suppressClick?.id===btn.dataset.atlasId&&performance.now()<this.suppressClick.expires)){
      e.preventDefault();e.stopImmediatePropagation();this.suppressClick=null;
    }
  }
  routeStart(id){this.routeFrom=id;this.updateRoute();}
  routeStop(){this.routeFrom=null;this.updateRoute();}
  updateRoute(e){
    const visible=this.mode==='route'&&!!this.routeFrom;this.routeSvg.hidden=!visible;
    if(!visible)return;
    const start=this.screenOf(this.routeFrom);if(!start){this.routeSvg.hidden=true;return;}
    const rect=this.canvas.getBoundingClientRect();const end=e?{x:e.clientX-rect.left,y:e.clientY-rect.top}:(this.lastRoutePointer||{x:start.x+75,y:start.y-40});
    if(e)this.lastRoutePointer=end;
    const mid={x:(start.x+end.x)*.5,y:(start.y+end.y)*.5-45};
    this.routePath.setAttribute('d',`M ${start.x.toFixed(2)},${start.y.toFixed(2)} Q ${mid.x.toFixed(2)},${mid.y.toFixed(2)} ${end.x.toFixed(2)},${end.y.toFixed(2)}`);
    this.routePath.setAttribute('stroke',this.panel.querySelector('#studioRouteKind').value==='starsilk'?'#4de9ff':'#d7e6f3');
  }
  cancel(){
    if(this.drag){this.engine.controls.enabled=this.drag.controlsEnabled;try{this.handle.releasePointerCapture(this.drag.pointer);}catch{}this.drag=null;}
    if(this.labelDrag){const d=this.labelDrag;d.button.style.removeProperty('transform');d.button.classList.remove('studio-label-dragging');try{d.button.releasePointerCapture(d.pointer);}catch{}this.labelDrag=null;}
    this.handle.classList.remove('dragging');this.ghost.hidden=true;this.updateHandle();
  }
  dispose(){this.cancel();if(this.engine)this.engine.controls.removeEventListener('change',this.engineChange);
    window.removeEventListener('resize',this.resizeHandler);document.removeEventListener('keydown',this.escapeHandler,true);
    this.handle.remove();this.ghost.remove();this.routeSvg.remove();this.labelStyles.remove();
  }
}
