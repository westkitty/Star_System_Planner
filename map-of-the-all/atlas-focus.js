/** Fullscreen-first Atlas presentation. All authoring features remain present,
 * but their surfaces open only by explicit pull-down tab gestures.
 * No changes to the Atlas data model or WebGL lifecycle.
 */
const byId = id => document.getElementById(id);
const DRAWERS = [
  ['nav','EXPLORE','leftPanel'],
  ['inspect','INSPECT','rightPanel'],
  ['edit','EDIT','studioPanel'],
  ['regions','REGIONS','strategyPanel'],
  ['routes','ROUTES','networkPanel'],
  ['eras','ERAS','temporalPanel'],
];
export function setupFullscreenAtlas() {
  const atlas=byId('atlas');const head=atlas?.querySelector('.top-bar');
  if (!atlas||!head||byId('atlasPullTabs')) return;
  atlas.classList.add('atlas-minimal');atlas.dataset.activeDrawer='none';
  const rail=document.createElement('nav');
  rail.id='atlasPullTabs';rail.className='atlas-pull-tabs';rail.setAttribute('aria-label','Open Atlas controls');
  const buttons=new Map();let active=null;
  for(const [key,label,panel] of DRAWERS){
    const b=document.createElement('button');b.type='button';b.className='atlas-pull-tab';
    b.dataset.drawer=key;b.setAttribute('aria-controls',panel);b.setAttribute('aria-expanded','false');
    b.setAttribute('aria-label','Toggle '+label.toLowerCase()+' tools');
    b.innerHTML=`<span>${label}</span><span class="atlas-tab-chevron" aria-hidden="true">\u2304</span>`;
    b.addEventListener('click',()=>activate(active===key?null:key));rail.append(b);buttons.set(key,b);
  }
  head.append(rail);

  // Move existing controls rather than cloning them; all original listeners,
  // data bindings and import/export handlers stay attached.
  const nav=byId('leftPanel'),eras=byId('temporalPanel'),camera=byId('sideTools');
  const utilities=document.querySelector('.bottom-utility');
  if(utilities){utilities.classList.add('atlas-drawer-utilities');nav.append(utilities);}
  const eraTitle=document.querySelector('.bottom-bar .era-title');
  const eraOptions=byId('eraOptions');
  if(eraOptions){const slot=document.createElement('div');slot.className='atlas-era-chooser';
    if(eraTitle)slot.append(eraTitle);slot.append(eraOptions);eras.insertBefore(slot,eras.children[1]||null);
  }
  const navActions=document.createElement('div');navActions.className='atlas-drawer-actions';
  for(const id of ['sourceGraphOpen','helpBtn','savedStatus']){const e=byId(id);if(e)navActions.append(e);}
  nav.append(navActions);
  const camActions=document.createElement('div');camActions.className='atlas-drawer-camera';
  for(const id of ['topBtn','resetCameraBtn']){const e=byId(id);if(e)camActions.append(e);}
  nav.append(camActions);
  const present=byId('presentBtn');if(present)present.hidden=true; // default is immersive.
  byId('rightPanel')?.classList.remove('mobile-open');

  function reflect(){
    atlas.dataset.activeDrawer=active||'none';
    for(const [key,b] of buttons){const expanded=key===active;b.setAttribute('aria-expanded',String(expanded));b.classList.toggle('active',expanded);}
  }
  function closeFeature(key){
    const close={regions:'strategyClose',routes:'networkClose',eras:'temporalClose'}[key];
    if(close&&!byId({regions:'strategyPanel',routes:'networkPanel',eras:'temporalPanel'}[key])?.hidden)byId(close)?.click();
    if(key==='edit')byId('studioPanel')?.querySelector('[data-studio-mode="orbit"]')?.click();
  }
  function activate(next){
    if(!DRAWERS.some(x=>x[0]===next))next=null;
    if(active&&active!==next)closeFeature(active);
    if(active===next){reflect();return;}
    active=next;atlas.classList.remove('focus-view');
    if(active==='regions'&&byId('strategyPanel')?.hidden)byId('strategyOpen')?.click();
    if(active==='routes'&&byId('networkPanel')?.hidden)byId('networkOpen')?.click();
    if(active==='eras'&&byId('temporalPanel')?.hidden)byId('temporalOpen')?.click();
    reflect();
  }
  for(const [close,key] of [['strategyClose','regions'],['networkClose','routes'],['temporalClose','eras']]){
    byId(close)?.addEventListener('click',()=>{if(active===key){active=null;reflect();}});
  }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&active&&!e.target.closest('dialog')){
      e.preventDefault();e.stopImmediatePropagation();activate(null);
    }
  },true);
  byId('spaceCanvas')?.addEventListener('pointerdown',()=>{
    if(['nav','inspect','eras'].includes(active))activate(null);
  },{passive:true});
  // Historic phone inspector auto-opening is deliberately not authoritative.
  // Inspector is shown only when the reader pulls down INSPECT.
  reflect();
  return {open:activate, current:()=>active};
}
