/** Phase 6 acceptance: real app, reversible epoch edits and legacy import. */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {seedAtlas} from '../map-of-the-all/atlas-data.js';
const host='http://127.0.0.1:4173',uri=host+'/Star_System_Planner/map-of-the-all/';
const browserPath=['/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/opt/google/chrome/chrome'].find(existsSync);
if(!browserPath)throw Error('Chromium required for temporal Atlas QA');
mkdirSync('atlas-qa-evidence',{recursive:true});
const server=spawn(process.execPath,['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';for(const stream of [server.stdout,server.stderr])stream.on('data',b=>log+=String(b).slice(0,1000));
let browser;const watchdog=setTimeout(()=>{console.error('PHASE6_BROWSER_TIMEOUT');server.kill('SIGTERM');process.exit(124)},150000);watchdog.unref();
async function ready(){for(let i=0;i<80;i++){
 if(server.exitCode!==null)throw Error('Preview terminated: '+log);
 try{const r=await fetch(uri);if(r.ok)return;}catch{}
 await new Promise(resolve=>setTimeout(resolve,200));
}throw Error('Preview did not start: '+log);}
async function waitSave(page,predicate){
 await page.waitForFunction((fn)=>{
  const raw=localStorage.getItem('starsilk.map-of-the-all.draft.v1');if(!raw)return false;
  try {return Function('state','return ('+fn+')(state)')(JSON.parse(raw));}catch{return false;}
 },String(predicate),{timeout:18000});
}
async function stored(page){return page.evaluate(()=>{
 const raw=localStorage.getItem('starsilk.map-of-the-all.draft.v1');return raw?JSON.parse(raw):null;
});}
async function run(){await ready();
 browser=await chromium.launch({executablePath:browserPath,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:{width:1536,height:864},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(uri,{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('.world-label').first().waitFor({timeout:30000});
 // New legacy seed becomes three reversible eras without manual migration.
 await page.locator('[data-drawer="nav"]').click();await page.locator('.node-btn[data-atlas-id="north-reach"]').click();await page.locator('[data-drawer="inspect"]').click();
 await page.locator('#objName').fill('POST / UNAUTHORED TEST');
 await page.locator('#objX').fill('-85');
 await page.locator('#applyBtn').click();
 await waitSave(page,s=>s.timeline?.snapshots?.post?.nodes[0]?.name==='POST / UNAUTHORED TEST');
 console.log('PHASE6_STAGE post-draft');
 await page.locator('[data-drawer="eras"]').click();
 assert.equal(await page.locator('#temporalPanel').isVisible(),true);
 assert.match(await page.locator('#temporalStatus').innerText(),/DIFFERENCES/);
 assert.ok(await page.locator('.temporal-trail').count()>=1,'Moved object has visible comparison trail');
 await page.screenshot({path:'atlas-qa-evidence/phase6-timeline-desktop.png'});
 console.log('PHASE6_STAGE comparison-overlay');
 // Real footer era buttons exercise the same path as the range scrubber.
 await page.locator('.era-btn').filter({hasText:'BLOOD ECLIPSE'}).click();
 await waitSave(page,s=>s.epoch==='war');
 const war=await stored(page);
 assert.equal(war.nodes.find(n=>n.id==='north-reach').name,'NORTH REACH');
 await page.locator('#temporalNote').fill('NOT CANON: draft exploration of an earlier survey.');
 await page.locator('#temporalSaveNote').click();
 await waitSave(page,s=>s.timeline?.notes?.war?.includes('NOT CANON'));
 await page.locator('#temporalScrub').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await waitSave(page,s=>s.epoch==='locking');
 await page.locator('.era-btn').filter({hasText:'POST-SIEGE'}).click();
 await waitSave(page,s=>s.epoch==='post');
 const post=await stored(page);
 assert.equal(post.nodes.find(n=>n.id==='north-reach').name,'POST / UNAUTHORED TEST');
 assert.equal(post.timeline.snapshots.war.nodes.find(n=>n.id==='north-reach').name,'NORTH REACH');
 console.log('PHASE6_STAGE independent-snapshots');
 // Explicit copy is the only cross-era overwrite. Undo must restore previous era.
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#temporalCloneBtn').click();
 await waitSave(page,s=>s.timeline?.snapshots?.war?.nodes[0]?.name==='POST / UNAUTHORED TEST');
 assert.match(await page.locator('#temporalStatus').innerText(),/NO DRAFT DIFFERENCES/);
 await page.keyboard.press('Control+z');
 await waitSave(page,s=>s.timeline?.snapshots?.war?.nodes[0]?.name==='NORTH REACH');
 console.log('PHASE6_STAGE copy-undo');
 // Export carries all three drafts and never source-elevates imported pointers.
 await page.locator('[data-drawer="nav"]').click();const promise=page.waitForEvent('download',{timeout:10000});await page.locator('#exportBtn').click();
 const download=await promise;assert.match(download.suggestedFilename(),/draft-v1\.json/);
 await page.reload({waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('.world-label').first().waitFor({timeout:30000});
 const afterReload=await stored(page);
 assert.equal(afterReload.timeline.snapshots.post.nodes[0].name,'POST / UNAUTHORED TEST');
 assert.match(afterReload.timeline.notes.war,/NOT CANON/);
 console.log('PHASE6_STAGE export-reload');
 await page.locator('[data-drawer="nav"]').click();await page.locator('#importBtn').click();
 await page.locator('#fileInput').setInputFiles({name:'legacy-atlas.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seedAtlas()))});
 await waitSave(page,s=>s.timeline?.snapshots?.post?.nodes[0]?.name==='NORTH REACH');
 const imported=await stored(page);
 assert.equal(imported.timeline.version,1);
 assert.equal(imported.timeline.snapshots.post.nodes.find(n=>n.id==='worldsvault').status,'draft');
 console.log('PHASE6_STAGE legacy-import-demotion');
 const parent=await page.goto(host+'/Star_System_Planner/',{waitUntil:'domcontentloaded',timeout:30000});assert.equal(parent.status(),200);
 await context.close();
 const mobile=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push('mobile:'+e.message));
 await phone.goto(uri,{waitUntil:'domcontentloaded',timeout:30000});
 await phone.locator('[data-drawer="eras"]').waitFor({state:'visible',timeout:25000});
 const hit=await phone.locator('[data-drawer="eras"]').boundingBox();assert.ok(hit?.height>=39,'mobile temporal launch target');
 await phone.locator('[data-drawer="eras"]').click();
 assert.equal(await phone.locator('#temporalPanel').isVisible(),true);
 const dims=await phone.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,closeHeight:document.getElementById('temporalClose').getBoundingClientRect().height}));
 assert.ok(dims.scroll<=dims.width,'mobile page must not overflow');
 assert.ok(dims.closeHeight>=40,'mobile close target');
 await phone.screenshot({path:'atlas-qa-evidence/phase6-timeline-mobile.png'});
 await phone.locator('#temporalClose').click();assert.equal(await phone.locator('#temporalPanel').isVisible(),false);
 await mobile.close();
 assert.deepEqual(errors,[]);
 console.log('PHASE6_BROWSER_PASS '+JSON.stringify({independent:true,comparison:true,ghost:true,cloneUndo:true,export:true,migration:true,parent:true,mobile:dims}));
}
try{await run();}catch(e){console.error('PHASE6_BROWSER_FAIL',e.stack||String(e));process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');clearTimeout(watchdog);}
process.exit(process.exitCode||0);
