/** Phase 5: assert the real read-only network path and explicit draft commit. */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const host='http://127.0.0.1:4173';
const uri=host+'/Star_System_Planner/map-of-the-all/';
const chrome=['/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/opt/google/chrome/chrome'].find(existsSync);
if(!chrome)throw Error('Chromium is required to validate network UI');
mkdirSync('atlas-qa-evidence',{recursive:true});
const server=spawn(process.execPath,['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>output+=String(chunk).slice(0,1000));
let browser;const watchdog=setTimeout(()=>{console.error('PHASE5_BROWSER_TIMEOUT');server.kill('SIGTERM');process.exit(124)},150000);watchdog.unref();
async function ready(){for(let i=0;i<70;i++){
 if(server.exitCode!==null)throw Error('Vite exited: '+output);
 try{const r=await fetch(uri);if(r.ok)return;}catch{}
 await new Promise(resolve=>setTimeout(resolve,250));
}throw Error('Vite preview never started: '+output);}
async function saved(page,match,params={}){
 await page.waitForFunction(({fn,params})=>{
  const raw=localStorage.getItem('starsilk.map-of-the-all.draft.v1');if(!raw)return false;
  try{return Function('s','p','return ('+fn+')(s,p)')(JSON.parse(raw),params);}catch{return false;}
 },{fn:String(match),params},{timeout:13000});
}
async function run(){await ready();
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:{width:1536,height:864},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push('DESKTOP: '+e.message));
 await page.goto(uri,{waitUntil:'domcontentloaded',timeout:25000});
 await page.locator('.world-label').first().waitFor({timeout:30000});
 await page.locator('#networkOpen').click();
 assert.equal(await page.locator('#networkPanel').isVisible(),true);
 assert.equal(await page.locator('#networkNodes').textContent(),'7');
 assert.equal(await page.locator('#networkLinks').textContent(),'10');
 assert.equal(await page.locator('#networkIslands').textContent(),'1');
 console.log('PHASE5_STAGE network_boot');
 await page.locator('#networkFrom').selectOption('north-reach');
 await page.locator('#networkTo').selectOption('southern-territories');
 await page.locator('#networkTrace').click();
 assert.match(await page.locator('#networkPath').innerText(),/^3 HOPS/);
 assert.equal(await page.locator('#networkPathOverlay').isVisible(),true);
 await page.screenshot({path:'atlas-qa-evidence/phase5-network-desktop.png'});
 console.log('PHASE5_STAGE projected_trace');
 for(const id of ['lane-1','lane-2'])await page.locator(`.network-closure-item[data-route-id="${id}"] input`).check();
 assert.match(await page.locator('#networkPath').innerText(),/NO CONNECTED DRAFT CORRIDOR/);
 assert.equal(await page.locator('#networkIslands').textContent(),'2');
 assert.match(await page.locator('#networkOutageInfo').innerText(),/2 temporarily closed/);
 await page.locator('#networkReset').click();
 assert.match(await page.locator('#networkPath').innerText(),/^3 HOPS/);
 console.log('PHASE5_STAGE closure_recovery');
 assert.equal(await page.locator('#networkCommit').isEnabled(),true);
 await page.locator('#networkCommit').click();
 await saved(page,s=>s.routes.length===11);
 assert.equal(await page.locator('#networkCommit').isDisabled(),true);
 await page.keyboard.press('Control+z');
 await saved(page,s=>s.routes.length===10);
 assert.equal(await page.locator('#networkCommit').isEnabled(),true);
 console.log('PHASE5_STAGE draft_commit_undo');
 await page.locator('#networkClose').click();
 await page.locator('.node-btn[data-atlas-id="north-reach"]').click();
 await page.locator('#enterBtn').click();
 await page.locator('#networkOpen').click();
 assert.equal(await page.locator('#networkNodes').textContent(),'5');
 assert.equal(await page.locator('#networkLinks').textContent(),'0');
 assert.equal(await page.locator('#networkIslands').textContent(),'5');
 assert.match(await page.locator('#networkPath').innerText(),/NO CONNECTED DRAFT CORRIDOR/);
 await page.locator('#networkClose').click();
 await page.locator('#sourceGraphOpen').click();
 assert.equal(await page.locator('#sourceGraphDialog').getAttribute('open'),'');
 await page.locator('#sourceGraphClose').click();
 const parent=await page.goto(host+'/Star_System_Planner/',{waitUntil:'domcontentloaded',timeout:25000});
 assert.equal(parent.status(),200);
 console.log('PHASE5_STAGE tier_and_parent');
 await context.close();
 const mobile=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push('MOBILE: '+e.message));
 await phone.goto(uri,{waitUntil:'domcontentloaded',timeout:25000});
 const trigger=phone.locator('#networkOpen');await trigger.waitFor({state:'visible',timeout:25000});
 const r=await trigger.boundingBox();assert.ok(r?.height>=39,'Network Lab opens with a tablet-friendly touch target');
 await trigger.click();assert.equal(await phone.locator('#networkPanel').isVisible(),true);
 const dims=await phone.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,button:document.querySelector('#networkTrace').getBoundingClientRect().height}));
 assert.ok(dims.scroll<=dims.w,'Network Lab mobile viewport must not overflow');
 assert.ok(dims.button>=40,'Primary actions must be at least 40 pixels high');
 await phone.screenshot({path:'atlas-qa-evidence/phase5-network-mobile.png'});
 await phone.locator('#networkClose').click();assert.equal(await phone.locator('#networkPanel').isVisible(),false);
 await mobile.close();
 assert.deepEqual(errors,[],'No JavaScript runtime page errors');
 console.log('PHASE5_BROWSER_PASS '+JSON.stringify({route:true,closure:true,undo:true,tier:true,source:true,parent:true,mobile:dims}));
}
try{await run();}catch(e){console.error('PHASE5_BROWSER_FAIL',e.stack||e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');clearTimeout(watchdog);}
process.exit(process.exitCode||0);
