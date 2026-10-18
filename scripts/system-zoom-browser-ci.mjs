/**
 * Real camera navigation + three-dimensional orbital scene acceptance.
 * Runs against Vite's built Atlas and preserves the independent root Planner.
 */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const PORT=4219,base='http://127.0.0.1:'+PORT+'/Star_System_Planner/';
const browserPath=[
  process.env.ATLAS_CHROMIUM,
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium'
].find(path=>path&&existsSync(path));
if(!browserPath)throw Error('Chromium-compatible browser unavailable');
mkdirSync('atlas-qa-evidence',{recursive:true});
const server=spawn(process.execPath,['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1',
  '--port',String(PORT),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='',browser;
for(const s of [server.stdout,server.stderr])s.on('data',c=>serverLog+=String(c).slice(0,2400));
async function ready(){
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Preview failed '+serverLog);
    try{if((await fetch(base+'map-of-the-all/')).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw Error('Preview failed to listen: '+serverLog);
}
async function stage(page,name){
  await page.waitForFunction(()=>Number(document.getElementById('drawCalls')?.textContent)>0,{timeout:20000});
  const data=await page.evaluate(()=>({
    draws:Number(document.getElementById('drawCalls')?.textContent),
    labels:document.querySelectorAll('.world-label').length,
    crumbs:document.querySelectorAll('#breadcrumb button').length,
    viewport:innerWidth,scroll:document.documentElement.scrollWidth,
    hud:document.getElementById('stellarHud').hidden,
    scene:document.getElementById('stellarHudInfo').textContent
  }));
  assert.ok(data.draws>0&&data.draws<155,name+' real WebGL draw calls within budget');
  assert.ok(data.scroll<=data.viewport,name+' no horizontal overflow');
  console.log('ORBIT_STAGE '+name+' '+JSON.stringify(data));
  return data;
}
function catchFaults(page){
  const faults=[];
  page.on('pageerror',e=>faults.push('PAGE: '+e.message));
  page.on('console',m=>{
    if(m.type()==='error'&&/WebGLProgram|Shader Error|INVALID_OPERATION|THREE.WebGL/i.test(m.text()))
      faults.push('GPU: '+m.text());
  });
  return faults;
}
async function waitTier(page,tier){
  await page.waitForFunction(level=>document.querySelectorAll('#breadcrumb button').length===level,
    tier,{timeout:16000});
}
async function desktop(){
  const context=await browser.newContext({viewport:{width:1536,height:864}});
  const page=await context.newPage(),faults=catchFaults(page);
  assert.equal((await page.goto(base+'map-of-the-all/',{waitUntil:'domcontentloaded'})).status(),200);
  await stage(page,'all');
  await page.locator('.world-label[data-atlas-id="perseus-confluence"]').dblclick();
  await waitTier(page,2);
  await stage(page,'galaxy');
  const selected=page.locator('.world-label[data-atlas-id="perseus-confluence-system-2"]');
  await selected.click();
  assert.ok(await page.locator('#stellarDive').isVisible(),'selected star has a visible entry control');
  assert.match(await page.locator('#stellarDiveName').innerText(),/SURVEY/);
  await page.locator('#stellarDiveButton').click();
  await waitTier(page,3);
  assert.ok(await page.locator('#stellarHud').isVisible(),'immersive system breadcrumb is visible');
  assert.match(await page.locator('#stellarHudInfo').textContent(),/3 EDITABLE PLANETS.*MOONS.*ASTEROIDS/);
  await stage(page,'orbital-scene');
  await page.screenshot({path:'atlas-qa-evidence/system-zoom-full-desktop.png'});
  const planet=page.locator('.world-label[data-atlas-id="perseus-confluence-system-2-planet-1"]');
  await planet.waitFor({state:'visible'});
  await planet.dblclick();
  await page.waitForFunction(()=>document.querySelector('#stellarHud')?.dataset.tracking==='planet');
  await stage(page,'planet-focus');
  await page.screenshot({path:'atlas-qa-evidence/system-zoom-planet-desktop.png'});
  // Switching to a different saved planet while close-up must move tracking too.
  await page.locator('[data-drawer="nav"]').click();
  await page.locator('#nodeList .node-btn[data-atlas-id="perseus-confluence-system-2-planet-2"]').click();
  await page.waitForFunction(()=>document.querySelector('.world-label.selected')?.dataset.atlasId===
    'perseus-confluence-system-2-planet-2');
  assert.equal(await page.locator('#stellarHud').getAttribute('data-tracking'),'planet');
  await page.locator('[data-drawer="nav"]').click();
  await page.locator('#stellarOverviewButton').click();
  assert.equal(await page.locator('#stellarHud').getAttribute('data-tracking'),'none');
  assert.equal((await stage(page,'overview')).crumbs,3);
  await page.locator('[data-drawer="nav"]').click();
  await page.locator('#addNodeBtn').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')||'{}')
    .nodes?.filter(n=>n.parentId==='perseus-confluence-system-2'&&n.kind==='planet').length===4);
  assert.match(await page.locator('#stellarHudInfo').textContent(),/4 EDITABLE PLANETS/);
  await stage(page,'planet-created');
  await page.keyboard.press('Control+z');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')||'{}')
    .nodes?.filter(n=>n.parentId==='perseus-confluence-system-2'&&n.kind==='planet').length===3);
  await page.locator('[data-drawer="nav"]').click();
  assert.match(await page.locator('#stellarHudInfo').textContent(),/3 EDITABLE PLANETS/);
  await page.locator('#stellarBackButton').click();
  await waitTier(page,2);
  const next=page.locator('.world-label[data-atlas-id="perseus-confluence-system-4"]');
  await next.click();
  await page.keyboard.press('f'); // Existing focus shortcut re-centers target.
  const rect=await page.locator('#spaceCanvas').boundingBox();
  await page.mouse.move(rect.x+rect.width*.50,rect.y+rect.height*.61);
  for(let i=0;i<20;i++){
    await page.mouse.wheel(0,-350);
    await page.waitForTimeout(120);
    if((await page.locator('#breadcrumb button').count())===3)break;
  }
  assert.equal((await stage(page,'wheel-dolly')).crumbs,3,
    'physical inward wheel zoom automatically opens the approached system');
  assert.match(await page.locator('#stellarHudName').innerText(),/SURVEY 03-4/);
  assert.deepEqual(faults,[],'desktop cannot emit GPU or JS errors');
  await context.close();
}
async function phone(){
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,
    hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(),faults=catchFaults(page);
  assert.equal((await page.goto(base+'map-of-the-all/',{waitUntil:'domcontentloaded'})).status(),200);
  await page.locator('.world-label[data-atlas-id="perseus-confluence"]').dblclick();
  await waitTier(page,2);
  const star=page.locator('.world-label[data-atlas-id^="perseus-confluence-system-"]').first();
  await star.tap();
  assert.ok(await page.locator('#stellarDive').isVisible(),'touch-selected system has 44px entry CTA');
  const size=await page.locator('#stellarDiveButton').boundingBox();
  assert.ok(size.height>=44,'tap-friendly system entry');
  await page.locator('#stellarDiveButton').tap();
  await waitTier(page,3);
  assert.ok(await page.locator('#stellarHud').isVisible(),'touch orbit HUD');
  await stage(page,'phone-system');
  await page.screenshot({path:'atlas-qa-evidence/system-zoom-phone.png'});
  await page.locator('#stellarBackButton').tap();
  await waitTier(page,2);
  assert.deepEqual(faults,[],'mobile cannot emit GPU or JS errors');
  await context.close();
}
try{
  await ready();
  browser=await chromium.launch({headless:true,executablePath:browserPath,args:[
    '--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  assert.equal((await fetch(base)).status,200,'root Planner remains accessible');
  await desktop();
  await phone();
  console.log('SYSTEM_ZOOM_BROWSER_PASS wheel=true enter=true planetFocus=true back=true phone=true');
}catch(e){
  console.error('SYSTEM_ZOOM_BROWSER_FAIL',e.stack||e);
  process.exitCode=1;
}finally{await browser?.close();server.kill('SIGTERM');}
process.exit(process.exitCode||0);
