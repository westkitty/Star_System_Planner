import { AtlasEngine } from './atlas-engine.js';
import {setupFullscreenAtlas} from './atlas-focus.js';
import { TemporalLab } from './temporal-lab.js';
import {ensureTimeline, syncEra, switchEra, cloneEra, writeEraNote} from './temporal-model.js';
import { StrategicStudio } from './strategic-studio.js';
import { NetworkLab } from './network-lab.js';
import { SpatialStudio } from './spatial-studio.js';
import { validateCorridor } from './studio-math.js';
import { initSourceGraph } from './source-graph-ui.js';
import { createPlannerHandoff, validateHandoff, makeHandoffFilename } from './planner-handoff.js';
import { VERSION, STORAGE_KEY, CANON_BASE, EPOCHS, LAYERS, seedAtlas, nodeById, childNodes, ancestry, validateAtlas, sanitizeAtlas, addNode, removeNode, uniqueId, RESEARCH_ANCHORS } from './atlas-data.js';

const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const gui={
  canvas:$('spaceCanvas'), labels:$('labels'),atlas:$('atlas'), left:$('leftPanel'), right:$('rightPanel'),
  source:$('sourceLinks'), layers:$('layerControls'), nodes:$('nodeList'), breadcrumb:$('breadcrumb'),
  form:$('objectForm'), search:$('search'), results:$('searchResults')
};
let state;let view={kind:'all',id:null};let engine=null;let studio=null;let strategy=null;let networkLab=null;let temporal=null;let revision=0;let pendingRoute=null;let allVisible=true;let saveTimer=null;let history=[];
function message(text,error=false){const toast=el('div','toast'+(error?' error':''),text);$('notifications').append(toast);setTimeout(()=>toast.remove(),3500);}
function bootstrapState(){
  try{const json=localStorage.getItem(STORAGE_KEY);if(json){const data=JSON.parse(json);const errors=validateAtlas(data);if(!errors.length)return data;message('Saved draft rejected: '+errors[0],true);}}
  catch(e){message('Local storage unavailable; use JSON export.',true);}
  return seedAtlas();
}
state=bootstrapState();
ensureTimeline(state);
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{
  try{state.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('savedStatus').textContent='DRAFT SAVED';}
  catch(e){$('savedStatus').textContent='EXPORT REQUIRED';message('Storage blocked. Export your draft.',true);}
},250);}
function change(mutator,{geometry=true}={}){
  const prior=JSON.stringify(state);
  try{mutator();syncEra(state);const errors=validateAtlas(state);if(errors.length)throw new Error(errors[0]);}
  catch(e){state=JSON.parse(prior);message('Change rejected: '+e.message,true);return false;}
  history.push(prior);if(history.length>30)history.shift();revision++;
  if(geometry)engine?.setState(state,view);else engine?.updateLabels();
  updateUI();persist();return true;
}
function enter(viewKind,id){
  studio?.cancel();studio?.routeStop();strategy?.cancelGesture();strategy?.cancelDrawing();pendingRoute=null;
  const n=nodeById(state,id);
  if(viewKind==='galaxy'&&n?.kind!=='galaxy')return;
  if(viewKind==='system'&&n?.kind!=='system')return;
  view={kind:viewKind,id:viewKind==='all'?null:id};
  state.selected=null;engine?.setView(view);updateUI();
  const name=n?.name||'THE ALL';$('savedStatus').textContent='VIEW / '+name.slice(0,14);
}
function enterSelected(){const n=nodeById(state,state.selected);
  if(n?.kind==='galaxy')enter('galaxy',n.id);
  else if(n?.kind==='system')enter('system',n.id);
  else message('This object has no deeper cartographic tier.');
}
function up(){if(view.kind==='system'){
  const node=nodeById(state,view.id);enter('galaxy',node?.parentId);
}else if(view.kind==='galaxy')enter('all',null);else{state.selected=null;updateUI();}}
function select(id,autoEnter=false,ev=null){
  if(strategy?.consumeSelect(id,ev))return;
  const n=nodeById(state,id);if(!n){if(id==='wall-concept')message('The Siege Wall: containment by heliocide, not ordinary masonry.');return;}
  if(studio?.mode==='route'){
    if(!pendingRoute){
      if(n.status!=='draft'||!['galaxy','system','planet'].includes(n.kind)){message('Select an editable galaxy, system or planet as corridor origin.',true);return;}
      if(!currentNodes().some(x=>x.id===id)){message('Corridor origin must be visible in the current tier.',true);return;}
      pendingRoute=id;state.selected=id;updateUI();studio.routeStart(id);
      message('Now choose another draft '+n.kind+' in this tier. Escape cancels.');return;
    }
    if(pendingRoute===id){pendingRoute=null;studio.routeStop();message('Corridor drafting cancelled.');return;}
    const source=pendingRoute, issue=validateCorridor(state,source,id);
    if(issue){message(issue,true);return;}
    const kind=$('studioRouteKind').value;
    const ok=change(()=>{state.routes.push({id:uniqueId(state,'draft-lane'),from:source,to:id,kind,status:'draft'});});
    if(ok){pendingRoute=null;studio.routeStop();state.selected=id;updateUI();message('Draft corridor committed. No physical path or canon route asserted.');}
    return;
  }
  if(view.kind==='all'&&n.parentId){
    const chain=ancestry(state,id);if(chain[0]?.kind==='galaxy'){if(n.kind==='planet'){enter('system',n.parentId);}else enter('galaxy',chain[0].id);}
  }else if(view.kind==='galaxy'&&n.kind==='planet'){enter('system',n.parentId);}
  state.selected=n.id;updateUI();
  if(autoEnter)enterSelected();
  if(innerWidth<=620)gui.right.classList.add('mobile-open');
}
function focusSelected(){const n=nodeById(state,state.selected);if(n)engine?.focusOn(n);}
function button(text,cls,action){const b=el('button',cls,text);b.type='button';b.addEventListener('click',action);return b;}
function updateBreadcrumb(){const frag=document.createDocumentFragment();frag.append(button('THE ALL','',()=>enter('all',null)));
  if(view.kind!=='all')for(const n of ancestry(state,view.id)){
    if(n.kind==='galaxy')frag.append(button(n.name,'',()=>enter('galaxy',n.id)));
    else if(n.kind==='system')frag.append(button(n.name,'',()=>enter('system',n.id)));
  }
  gui.breadcrumb.replaceChildren(frag);
}
function updateLayers(){const frag=document.createDocumentFragment();
  for(const [key,label] of LAYERS){const row=el('label','layer-option');const input=el('input');input.type='checkbox';input.checked=state.layers[key];input.setAttribute('aria-label','Toggle '+label);
    input.addEventListener('change',()=>change(()=>{state.layers[key]=input.checked;}));
    row.append(input,el('span','',label),el('em','',state.layers[key]?'ON':'OFF'));frag.append(row);
  }
  gui.layers.replaceChildren(frag);
}
function currentNodes(){
  if(view.kind==='all')return childNodes(state,null).filter(n=>n.kind==='galaxy'||n.kind==='landmark'||n.kind==='annotation');
  return childNodes(state,view.id).filter(n=>view.kind==='galaxy'?['system','annotation'].includes(n.kind):['planet','annotation'].includes(n.kind));
}
function updateNodeList(){const frag=document.createDocumentFragment();for(const n of currentNodes()){
  const b=button(n.name,'node-btn'+(state.selected===n.id?' active':''),event=>select(n.id,false,event));
  b.dataset.atlasId=n.id;
  const icon=el('span','node-icon');icon.style.background=n.color;icon.style.color=n.color;b.prepend(icon);
  b.title=n.kind.toUpperCase()+' / '+(n.status==='reference'?'SOURCE IDENTITY':'DRAFT');
  frag.append(b);
}
 gui.nodes.replaceChildren(frag);
 const nlabel=view.kind==='all'?'GALAXY':view.kind==='galaxy'?'SYSTEM':'PLANET';
 $('addNodeBtn').textContent='+ ADD '+nlabel;
}
function updateRoutes(){
  const frag=document.createDocumentFragment();const inView=n=>n?.parentId===view.id;
  const visible=state.routes.filter(r=>inView(nodeById(state,r.from))&&inView(nodeById(state,r.to)));
  for(const route of visible){
    const a=nodeById(state,route.from),b=nodeById(state,route.to);
    const row=el('div','route-entry');
    const label=el('span','',(a?.name||route.from)+' / '+(b?.name||route.to));
    const mode=button(route.kind==='hookshot'?'H':'S','route-mode',()=>{change(()=>{route.kind=route.kind==='hookshot'?'starsilk':'hookshot';});});
    mode.title='Toggle illustrative Hookshot / Starsilk representation';
    const del=button('×','route-delete',()=>{change(()=>{state.routes=state.routes.filter(r=>r.id!==route.id);});});
    del.title='Remove draft corridor';del.setAttribute('aria-label','Remove corridor '+label.textContent);
    row.append(label,mode,del);frag.append(row);
  }
  if(!visible.length)frag.append(el('p','small-note','No draft corridors in this view.'));
  $('routeList').replaceChildren(frag);
}
function fillInspector(){const n=nodeById(state,state.selected);const intro=$('inspectorDescription');
  gui.form.hidden=!n;
  if(!n){$('inspectorTitle').textContent=view.kind==='all'?'A UNIVERSE IN REVISION':'INSPECT THE UNKNOWN';$('inspectorKind').textContent=view.kind.toUpperCase()+' / OBSERVATORY';
    intro.textContent=view.kind==='all'?'Many galaxies, one continuum. Choose a luminous node to open its evidence and editable draft geometry.':'Select a luminous marker to inspect it; double-click to descend one cosmic scale.';
    $('inspectorStatus').textContent='SOURCE / VISUALIZATION SEPARATED';$('objectSigil').style.borderColor='rgba(120,201,231,.4)';return;}
  $('inspectorTitle').textContent=n.name;$('inspectorKind').textContent=n.kind.toUpperCase()+' / '+(n.status==='reference'?'CANON CONCEPT':'EDITORIAL DRAFT');
  intro.textContent=n.description||(n.status==='reference'?'Source identity; coordinate is illustrative.':'This location is provisional. You may change its position, label, and descriptive notes.');
  $('inspectorStatus').textContent=n.status==='reference'?'SOURCE IDENTITY / READ ONLY':'DRAFT COORDINATE / NOT CANON';
  $('objectSigil').style.borderColor=n.color;
  $('objName').value=n.name;$('objDescription').value=n.description;
  for(const [axis,index] of [['X',0],['Y',1],['Z',2]])$('obj'+axis).value=String(n.position[index]);
  $('objColor').value=n.color;$('objSize').value=n.size;
  $('objLabelShow').checked=n.label.show;$('objLabelColor').value=n.label.color;
  $('objLabelSize').value=n.label.size;$('objLabelFamily').value=n.label.family;
  const readOnly=n.status==='reference';
  for(const field of gui.form.querySelectorAll('input,textarea,select'))field.disabled=readOnly;
  $('applyBtn').disabled=readOnly;$('enterBtn').disabled=!['galaxy','system'].includes(n.kind);
  $('deleteBtn').textContent=readOnly?'FORK AS DRAFT':'DELETE DRAFT';
  $('connectBtn').disabled=readOnly||!['galaxy','system','planet'].includes(n.kind);
}
function updateSources(){const frag=document.createDocumentFragment();const n=nodeById(state,state.selected);
  const entries=n?.sourceUrl?[{name:n.name,description:'Source-backed identity; position on this map is draft.',url:n.sourceUrl},...RESEARCH_ANCHORS.slice(0,2)]:RESEARCH_ANCHORS;
  for(const a of entries){const link=el('a','source-item');link.href=a.url;link.target='_blank';link.rel='noopener noreferrer';link.append(el('strong','',a.name),el('span','',a.description));frag.append(link);}
  gui.source.replaceChildren(frag);
}
function updateCounts(){ $('countGalaxy').textContent=String(state.nodes.filter(n=>n.kind==='galaxy').length).padStart(2,'0');
  $('countSystems').textContent=String(state.nodes.filter(n=>n.kind==='system').length).padStart(2,'0');
}
function activateEra(id){
  if(id===state.epoch)return;
  studio?.cancel();studio?.routeStop();pendingRoute=null;strategy?.close();networkLab?.close();
  const accepted=change(()=>switchEra(state,id));
  if(accepted){if(view.id&&!nodeById(state,view.id))enter('all',null);message('Switched independent provisional draft to '+EPOCHS.find(e=>e.id===id)?.title+'.');}
}
function updateEpoch(){const current=EPOCHS.find(x=>x.id===state.epoch);
  $('eraLabel').textContent=current.title.toUpperCase();const frag=document.createDocumentFragment();
  for(const e of EPOCHS){const b=button('', 'era-btn'+(e.id===state.epoch?' active':''),()=>activateEra(e.id));
    b.append(el('b','',e.title.toUpperCase()),el('span','',e.id==='war'?'BLOOD RINGS':e.id==='locking'?'CONTAINMENT':'ARCHIVE / SURVEY'));
    b.title=e.note;b.setAttribute('aria-pressed',e.id===state.epoch?'true':'false');frag.append(b);
  }
  $('eraOptions').replaceChildren(frag);
}
function currentHandoffSystem(){
  const selected=nodeById(state,state.selected);
  if(selected?.kind==='system'&&selected.status==='draft')return selected;
  const focused=view.kind==='system'?nodeById(state,view.id):null;
  return focused?.status==='draft'?focused:null;
}
function updateHandoff(){
  const system=currentHandoffSystem();
  $('handoffExportBtn').disabled=!system;
  $('plannerHandoffInfo').textContent=system
    ? `Prepare ${system.name} and its draft planets as a hypothetical system. Orbital distances, star mass and planetary properties use sandbox defaults; these are NOT measurements of this atlas.`
    : 'Select a draft system or enter its system view. Export creates a hypothetical .ssp.json, not canon coordinates.';
}
function exportPlannerHandoff(){
  const system=currentHandoffSystem();if(!system){message('Select a draft system before orbital export.',true);return;}
  try{
    const project=createPlannerHandoff(state,system.id);
    const errors=validateHandoff(project);if(errors.length)throw new Error(errors.join('; '));
    const file=new Blob([JSON.stringify(project,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(file),anchor=el('a');anchor.href=url;anchor.download=makeHandoffFilename(project);
    document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    message('Hypothetical system exported. Open System Planner and use IMPORT; nothing has been auto-loaded.');
  }catch(e){message('Orbital export refused: '+e.message,true);}
}
function updateUI(){updateBreadcrumb();updateLayers();updateNodeList();updateRoutes();fillInspector();updateSources();updateCounts();updateEpoch();updateHandoff();
  $('quality').value=state.quality;$('motionBtn').textContent=state.motion?'MOTION ON':'MOTION OFF';
  studio?.sync();strategy?.sync();networkLab?.sync();temporal?.sync();
}
function focusSearch(){gui.search.focus();if(innerWidth<=620)gui.left.classList.add('expanded');}
function showSearch(){const q=gui.search.value.toLowerCase().trim();const frag=document.createDocumentFragment();if(q){
  const hits=state.nodes.filter(n=>n.name.toLowerCase().includes(q)||n.description.toLowerCase().includes(q)).slice(0,16);
  for(const n of hits){const b=button(n.name,'search-result',()=>{gui.search.value='';gui.results.hidden=true;select(n.id);});
    b.append(el('small','',n.kind+' / '+(n.parentId||'THE ALL')));frag.append(b);}
  if(!hits.length)frag.append(el('div','search-result','No objects found'));
}
  gui.results.replaceChildren(frag);gui.results.hidden=!q;
}
function addCurrentNode(kind){const parentId=kind==='galaxy'?null:view.id;
  let id;const ok=change(()=>{const n=addNode(state,kind,parentId);id=n.id;});
  if(ok){select(id);message('New '+kind+' added to the draft.');}
}
function saveInspector(ev){ev.preventDefault();const n=nodeById(state,state.selected);if(!n||n.status!=='draft')return;
  const nums=['X','Y','Z'].map(a=>Number($('obj'+a).value));const sz=Number($('objSize').value),fs=Number($('objLabelSize').value);
  if(nums.some(v=>!Number.isFinite(v))||!Number.isFinite(sz)||!Number.isFinite(fs)){message('Invalid numeric value.',true);return;}
  if(change(()=>{n.name=$('objName').value.trim();n.description=$('objDescription').value.trim();n.position=nums;
    n.color=$('objColor').value;n.size=sz;n.label={show:$('objLabelShow').checked,color:$('objLabelColor').value,size:fs,family:$('objLabelFamily').value, ...(n.label.offset?{offset:[...n.label.offset]}:{})};}))message('Draft geometry and typography updated.');
}
function removeOrFork(){const n=nodeById(state,state.selected);if(!n)return;
  if(n.status==='reference'){
    let id;change(()=>{id=uniqueId(state,'draft-reference');state.nodes.push({...structuredClone(n),id,name:n.name+' / DRAFT',status:'draft',sourceUrl:null});});
    select(id);message('Created an editable draft. The source reference remains protected.');return;
  }
  if(!confirm('Delete this draft object and any children or connected routes?'))return;
  change(()=>{removeNode(state,n.id);});message('Draft object deleted.');
}
function connectRoute(){const n=nodeById(state,state.selected);if(!n||n.status!=='draft')return;
  studio?.setMode('route');pendingRoute=n.id;studio?.routeStart(n.id);
  message('Choose another '+n.kind+' at this tier. Proposed route only; Escape cancels.');
}
function moveDraftNode(id,position){
  const n=nodeById(state,id);if(!n||n.status!=='draft')return;
  if(change(()=>{n.position=position;}))message('Draft marker repositioned. Undo available; no canon coordinates changed.');
}
function moveDraftLabel(id,offset){
  const n=nodeById(state,id);if(!n||n.status!=='draft')return;
  if(change(()=>{n.label.offset=offset;},{geometry:false}))message('Draft label offset saved. Undo available.');
}
function commitNetworkLink({from,to,kind}){
  const reason=validateCorridor(state,from,to);
  if(reason||!['hookshot','starsilk'].includes(kind)){message('Draft corridor refused: '+(reason||'Invalid corridor kind'),true);return false;}
  return change(()=>{
    let next=1,id;
    do{id='draft-network-'+next++;}while(state.routes.some(r=>r.id===id)||state.nodes.some(n=>n.id===id));
    state.routes.push({id,from,to,kind,status:'draft'});
  });
}
function exportAtlas(){syncEra(state);const data={...state,selected:null,updatedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download='starsilk-map-of-the-all-draft-v'+VERSION+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('JSON atlas exported. No canon has been changed.');
}
async function importAtlas(file){if(!file)return;if(file.size>1200000){message('JSON exceeds 800 KB import limit.',true);return;}
  try{const contents=await file.text();const parsed=sanitizeAtlas(JSON.parse(contents));const previous=JSON.stringify(state);
    strategy?.cancelGesture();strategy?.cancelDrawing();
    studio?.cancel();studio?.routeStop();state=parsed;ensureTimeline(state);history.push(previous);view={kind:'all',id:null};pendingRoute=null;engine?.setState(state,view);engine?.setView(view);updateUI();persist();message('Imported as draft: source status intentionally demoted.');
  }catch(e){message('Import refused: '+e.message,true);}
}
function undo(){if(!history.length){message('No changes to undo.');return;}strategy?.cancelGesture();strategy?.cancelDrawing();studio?.cancel();studio?.routeStop();pendingRoute=null;state=JSON.parse(history.pop());
  if(view.id&&!nodeById(state,view.id))view={kind:'all',id:null};engine?.setState(state,view);updateUI();persist();message('Reverted last edit.');
}
function resetCamera(){engine?.setView(view);}
function toggleFocus(){gui.atlas.classList.toggle('focus-view');if(!gui.atlas.classList.contains('focus-view'))gui.right.classList.remove('mobile-open');}
function bind(){
  $('temporalOpen').addEventListener('click',()=>{networkLab?.close();strategy?.close();studio?.setMode('orbit');temporal?.open();});
  $('strategyOpen').addEventListener('click',()=>{if(!strategy)return;temporal?.close();networkLab?.close();studio?.setMode('orbit');strategy.open();});
  $('networkOpen').addEventListener('click',()=>{if(!networkLab)return;temporal?.close();studio?.setMode('orbit');strategy?.close();networkLab.open();});
  $('objectForm').addEventListener('submit',saveInspector);
  $('closeMobileInspector').addEventListener('click',()=>gui.right.classList.remove('mobile-open'));
  $('enterBtn').addEventListener('click',enterSelected);$('focusBtn').addEventListener('click',focusSelected);
  $('connectBtn').addEventListener('click',connectRoute);$('deleteBtn').addEventListener('click',removeOrFork);
  $('addNodeBtn').addEventListener('click',()=>addCurrentNode(view.kind==='all'?'galaxy':view.kind==='galaxy'?'system':'planet'));
  $('addAnnotationBtn').addEventListener('click',()=>addCurrentNode('annotation'));
  $('allLayersBtn').addEventListener('click',()=>{allVisible=!allVisible;change(()=>{for(const [k] of LAYERS)state.layers[k]=allVisible;});});
  $('homeBtn').addEventListener('click',()=>enter('all',null));$('resetCameraBtn').addEventListener('click',resetCamera);
  $('topBtn').addEventListener('click',()=>{if(!engine)return;const d=engine.camera.position.distanceTo(engine.controls.target);engine.camera.position.set(engine.controls.target.x+.01,engine.controls.target.y+d,engine.controls.target.z+.01);engine.controls.update();});
  $('quality').addEventListener('change',ev=>change(()=>{state.quality=ev.target.value;}));
  $('motionBtn').addEventListener('click',()=>change(()=>{state.motion=!state.motion;},{geometry:false}));
  $('presentBtn').addEventListener('click',toggleFocus);
  $('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());
  $('handoffExportBtn').addEventListener('click',exportPlannerHandoff);
  $('exportBtn').addEventListener('click',exportAtlas);$('importBtn').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',ev=>{importAtlas(ev.target.files?.[0]);ev.target.value='';});
  gui.search.addEventListener('input',showSearch);gui.search.addEventListener('focus',()=>{if(innerWidth<=620)gui.left.classList.add('expanded');});
  document.addEventListener('keydown',ev=>{
    if(ev.target.matches('input,textarea,select')||$('helpDialog').open||$('sourceGraphDialog').open)return;
    if(ev.key==='/'&&!ev.ctrlKey){ev.preventDefault();focusSearch();}
    else if(ev.key.toLowerCase()==='h'){toggleFocus();}
    else if(ev.key.toLowerCase()==='f'){focusSelected();}
    else if(ev.key==='Escape'){ev.preventDefault();up();gui.right.classList.remove('mobile-open');}
    else if(ev.key==='Home'){enter('all',null);}
    else if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){ev.preventDefault();undo();}
  });
  const mobile=button('INSPECT OBJECT','mobile-inspect',()=>{gui.right.classList.toggle('mobile-open');gui.left.classList.remove('expanded');});
  gui.atlas.append(mobile);
  document.addEventListener('visibilitychange',()=>{if(engine)engine.paused=document.hidden||!!networkLab?.opened||!!(strategy?.opened&&strategy.mode!=='pan')||['move','label'].includes(studio?.mode);});
}
function init(){updateUI();bind();
  try{initSourceGraph();}catch(e){$('sourceGraphOpen').disabled=true;message('Source topology unavailable: '+e.message,true);}
  try{engine=new AtlasEngine(gui.canvas,gui.labels,{onSelect:select,onViewChanged:updateUI});engine.setState(state,view);
    studio=new SpatialStudio({canvas:gui.canvas,labelsRoot:gui.labels,atlas:gui.atlas,panel:$('studioPanel'),
      getState:()=>state,getView:()=>view,onMove:moveDraftNode,onLabelCommit:moveDraftLabel,
      onRouteCancel:()=>{pendingRoute=null;},
      onScale:value=>change(()=>{state.typographyScale=value;},{geometry:false}),
      onModeChange:()=>{pendingRoute=null;strategy?.close();networkLab?.close();},message});studio.attachEngine(engine);
    strategy=new StrategicStudio({canvas:gui.canvas,labelsRoot:gui.labels,atlas:gui.atlas,panel:$('strategyPanel'),
      getState:()=>state,getView:()=>view,onChange:mutator=>change(()=>mutator(state)),onMessage:message});
    strategy.attachEngine(engine);
    networkLab=new NetworkLab({canvas:gui.canvas,atlas:gui.atlas,panel:$('networkPanel'),
      getState:()=>state,getView:()=>view,onCommit:commitNetworkLink,message,
      isOtherEditorActive:()=>!!(strategy?.opened&&strategy.mode!=='pan')||['move','label'].includes(studio?.mode)});
    networkLab.attachEngine(engine);
    temporal=new TemporalLab({canvas:gui.canvas,atlas:gui.atlas,panel:$('temporalPanel'),getState:()=>state,getView:()=>view,
      message,onSwitch:activateEra,
      onCopy:(from,to)=>{if(change(()=>cloneEra(state,from,to)))message('Copied current draft into '+EPOCHS.find(e=>e.id===to)?.title+'. Undo is available.');},
      onNote:(era,note)=>{if(change(()=>writeEraNote(state,era,note),{geometry:false}))message('Era note saved as editorial draft.');}});
    temporal.attachEngine(engine);updateUI();
    $('loading').style.opacity='0';setTimeout(()=>$('loading').remove(),900);
    setInterval(()=>{if(engine&&document.visibilityState==='visible')$('drawCalls').textContent=String(engine.info().drawCalls).padStart(2,'0');},1000);
    message('The All is ready. All starting coordinates remain provisional.');
  }catch(e){$('loading').replaceChildren(el('h2','','3D RENDERER UNAVAILABLE'),el('p','','WebGL and the Three.js dependency are required. Your map data is still available for export.'),button('EXPORT MAP','primary-button',exportAtlas));
    console.error('Atlas startup:',e);}
}
init();
setupFullscreenAtlas();
