/** Phase 4 strategic cartography browser acceptance; scoped preview, no production write. */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {seedAtlas} from '../map-of-the-all/atlas-data.js';
const HOST='http://127.0.0.1:4173';
const ATLAS=HOST+'/Star_System_Planner/map-of-the-all/';
const chrome=['/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/opt/google/chrome/chrome'].find(existsSync);
if(!chrome)throw Error('Browser runner unavailable: Chromium required, not a passing test');
mkdirSync('atlas-qa-evidence',{recursive:true});
const server=spawn(process.execPath,['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';for(const f of [server.stdout,server.stderr])f.on('data',data=>output+=String(data).slice(0,800));
let browser;
const watchdog=setTimeout(()=>{console.error('PHASE4_BROWSER_TIMEOUT (150s)');server.kill('SIGTERM');process.exit(124)},150000);watchdog.unref();
async function ready(){for(let i=0;i<60;i++){
 if(server.exitCode!==null)throw Error('Preview server exited: '+output);
 try{const r=await fetch(ATLAS);if(r.ok)return;}catch{}
 await new Promise(resolve=>setTimeout(resolve,250));
}throw Error('Preview not ready: '+output);}
async function get(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')));}
async function waitForSave(page,check,args={}){await page.waitForFunction(({fn,args})=>{
 const raw=localStorage.getItem('starsilk.map-of-the-all.draft.v1');
 if(!raw)return false;
 const data=JSON.parse(raw);
 return Function('s','p','return ('+fn+')(s,p)')(data,args);
},{fn:String(check),args},{timeout:10000});}
const point=(b)=>({x:b.x+b.width/2,y:b.y+b.height/2});
async function movePointer(page,b,dx,dy){const p=point(b);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+dx,p.y+dy,{steps:8});await page.mouse.up();}
async function run(){await ready();
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:{width:1536,height:864},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push('DESKTOP '+e.message));
 await page.goto(ATLAS,{waitUntil:'domcontentloaded',timeout:25000});await page.locator('.world-label').first().waitFor({timeout:30000});
 console.log('PHASE4_STAGE boot');
 await page.locator('[data-drawer="regions"]').click();assert.equal(await page.locator('#strategyPanel').isVisible(),true);
 const n1='perseus-confluence',n2='centauri-marches';
 await page.locator(`.world-label[data-atlas-id="${n1}"]`).click();
 await page.locator(`.world-label[data-atlas-id="${n2}"]`).click({modifiers:['Shift']});
 assert.equal(await page.locator('#strategyCount').textContent(),'2');
 let before=(await get(page))??seedAtlas();const a=before.nodes.find(n=>n.id===n1).position[0],b=before.nodes.find(n=>n.id===n2).position[0];
 await page.locator('#strategyNudgeRight').click();
 await waitForSave(page,(s,p)=>s.nodes.find(n=>n.id==='perseus-confluence').position[0]===p.a+1&&s.nodes.find(n=>n.id==='centauri-marches').position[0]===p.b+1,{a,b});
 await page.keyboard.press('Control+z');
 await waitForSave(page,(s,p)=>s.nodes.find(n=>n.id==='perseus-confluence').position[0]===p.a&&s.nodes.find(n=>n.id==='centauri-marches').position[0]===p.b,{a,b});
 console.log('PHASE4_STAGE group_nudge_undo');
 const handle=page.locator('#strategyGroupHandle');await handle.waitFor({state:'visible',timeout:15000});
 const p=await handle.boundingBox();if(!p)throw Error('Group centroid gizmo not visible');
 await movePointer(page,p,46,24);
 await page.waitForFunction(({a,b})=>{
  const s=JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1'));
  return s.nodes.find(n=>n.id==='perseus-confluence').position[0]!==a&&s.nodes.find(n=>n.id==='centauri-marches').position[0]!==b;
 },{a,b},{timeout:11000});
 console.log('PHASE4_STAGE centroid_drag');
 await page.locator('#strategyFromGroup').click();
 assert.equal(await page.locator('#strategyModeRegion').getAttribute('aria-pressed'),'true');
 await waitForSave(page,s=>s.regions?.length===1);
 assert.equal(await page.locator('#strategyRegionForm').isVisible(),true);
 assert.match(await page.locator('#strategyRegionMetrics').innerText(),/display²/);
 await page.screenshot({path:'atlas-qa-evidence/phase4-sector-desktop.png'});
 console.log('PHASE4_STAGE region_create');
 await page.locator('#strategyRegionName').fill('THE UNCLAIMED REACH');
 await page.locator('#strategyRegionAffiliation').fill('DRAFT / NOT AN OFFICIAL FACTION');
 await page.locator('#strategyRegionForm button[type="submit"]').click();
 await waitForSave(page,s=>s.regions?.[0]?.name==='THE UNCLAIMED REACH');
 const oldLen=(await get(page)).regions[0].points.length;
 await page.locator('#strategyAddVertex').click();
 await waitForSave(page,(s,p)=>s.regions?.[0]?.points.length===p.oldLen+1,{oldLen});
 console.log('PHASE4_STAGE region_edit');
 await page.locator('#strategyModePan').click();assert.equal(await page.locator('#strategyModePan').getAttribute('aria-pressed'),'true');
 await page.locator('#strategyClose').click();assert.equal(await page.locator('#strategyPanel').isVisible(),false);
 await page.locator('[data-drawer="nav"]').click();await page.locator('#sourceGraphOpen').click();assert.equal(await page.locator('#sourceGraphDialog').getAttribute('open'),'');
 await page.locator('#sourceGraphClose').click();
 const parent=await page.goto(HOST+'/Star_System_Planner/',{waitUntil:'domcontentloaded',timeout:20000});assert.equal(parent.status(),200);
 console.log('PHASE4_STAGE parent_protected');
 await context.close();
 const mobile=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const m=await mobile.newPage();m.on('pageerror',e=>errors.push('MOBILE '+e.message));
 await m.goto(ATLAS,{waitUntil:'domcontentloaded',timeout:25000});await m.locator('[data-drawer="regions"]').waitFor({timeout:25000});
 await m.locator('[data-drawer="regions"]').click();await m.locator('#strategyModeRegion').click();
 const dims=await m.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,height:document.querySelector('#strategyModeRegion').getBoundingClientRect().height}));
 assert.ok(dims.scroll<=dims.w,'No horizontal overflow');assert.ok(dims.height>=40,'Touch target at least 40px');
 await m.screenshot({path:'atlas-qa-evidence/phase4-mobile-region-editor.png'});
 await m.locator('#strategyClose').click();assert.equal(await m.locator('#strategyPanel').isVisible(),false);
 await mobile.close();
 assert.deepEqual(errors,[],'No runtime page errors');
 console.log('PHASE4_BROWSER_PASS '+JSON.stringify({group:true,drag:true,undo:true,regions:true,metric:true,parent:true,mobile:dims}));
}
try{await run();}catch(e){console.error('PHASE4_BROWSER_FAIL',e.stack||e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');clearTimeout(watchdog);}
process.exit(process.exitCode||0);
