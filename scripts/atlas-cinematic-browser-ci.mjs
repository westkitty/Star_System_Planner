/**
 * Render-facing acceptance: three real Atlas zoom tiers, selection, quality,
 * desktop/mobile visual captures and shader-console health. CI and local Brave.
 */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';

const PORT=4199;
const base='http://127.0.0.1:'+PORT+'/Star_System_Planner/';
const candidates=[
  process.env.ATLAS_CHROMIUM,
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium'
];
const executablePath=candidates.find(path=>path&&existsSync(path));
if(!executablePath)throw Error('Chromium-compatible browser unavailable');
mkdirSync('atlas-qa-evidence',{recursive:true});
const server=spawn(process.execPath,['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(PORT),'--strictPort'],
  {stdio:['ignore','pipe','pipe']});
let logs='';
for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>logs+=String(chunk).slice(0,2000));
let browser;
async function ready(){
  for(let i=0;i<80;i++){
    if(server.exitCode!==null)throw Error('Preview exited '+logs);
    try{if((await fetch(base+'map-of-the-all/')).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error('Preview server unavailable '+logs);
}
async function live(page,tag){
  await page.locator('.world-label').first().waitFor({timeout:30000});
  await page.waitForFunction(()=>Number(document.querySelector('#drawCalls')?.textContent)>0,{timeout:30000});
  const stats=await page.evaluate(()=>({
    draws:Number(document.getElementById('drawCalls')?.textContent),
    labels:document.querySelectorAll('.world-label').length,
    scroll:document.documentElement.scrollWidth,
    width:innerWidth,
    centerPixel: (() => {
      const canvas=document.getElementById('spaceCanvas');
      return canvas.width>0&&canvas.height>0;
    })()
  }));
  assert.ok(stats.draws>0,tag+' GPU draw calls');
  assert.ok(stats.draws<=155,tag+' draw-call budget (<=155)');
  assert.ok(stats.labels>0,tag+' accessible projected labels');
  assert.ok(stats.scroll<=stats.width,tag+' no page overflow');
  assert.ok(stats.centerPixel,tag+' canvas has an actual render surface');
  console.log('ATLAS_VISUAL_STAGE '+tag+' '+JSON.stringify(stats));
  return stats;
}
async function checkDesktop(){
  const context=await browser.newContext({viewport:{width:1536,height:864},acceptDownloads:true});
  const page=await context.newPage(), faults=[];
  page.on('pageerror',error=>faults.push('page:'+error.message));
  page.on('console',message=>{
    if(message.type()==='error'&&/WebGLProgram|Shader Error|INVALID_OPERATION|THREE.WebGL/i.test(message.text()))
      faults.push('gpu:'+message.text());
  });
  assert.equal((await page.goto(base+'map-of-the-all/',{waitUntil:'domcontentloaded'})).status(),200);
  await live(page,'all');
  await page.screenshot({path:'atlas-qa-evidence/cinematic-all-desktop.png'});
  await page.locator('[data-drawer="eras"]').click();
  await page.locator('.era-btn').filter({hasText:'BLOOD ECLIPSE'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')||'{}').epoch==='war');
  await live(page,'blood-eclipse');
  await page.locator('.era-btn').filter({hasText:'POST-SIEGE'}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')||'{}').epoch==='post');
  await live(page,'post-siege');
  await page.locator('[data-drawer="eras"]').click();
  // A real projected galaxy is clicked, never a mocked node or screenshot link.
  const galaxy=page.locator('.world-label[data-atlas-id="perseus-confluence"]');
  await galaxy.waitFor({state:'visible',timeout:20000});
  await galaxy.click();
  await galaxy.dblclick();
  await page.waitForFunction(()=>document.querySelectorAll('#breadcrumb button').length===2);
  await live(page,'galaxy');
  await page.screenshot({path:'atlas-qa-evidence/cinematic-galaxy-desktop.png'});
  await page.locator('.world-label[data-atlas-id^="perseus-confluence-system-"]').first().dblclick();
  await page.waitForFunction(()=>document.querySelectorAll('#breadcrumb button').length===3);
  await live(page,'system');
  await page.screenshot({path:'atlas-qa-evidence/cinematic-system-desktop.png'});
  // Quality must remain usable after real multi-tier navigation.
  await page.locator('[data-drawer="nav"]').click();
  await page.locator('#quality').selectOption('battery');
  await page.locator('[data-drawer="nav"]').click();
  await live(page,'system-battery');
  assert.deepEqual(faults,[],'WebGL shader/runtime console must be clean');
  await context.close();
}
async function checkMobile(){
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(),faults=[];
  page.on('pageerror',error=>faults.push(error.message));
  page.on('console',message=>{
    if(message.type()==='error'&&/WebGLProgram|Shader Error|INVALID_OPERATION|THREE.WebGL/i.test(message.text()))faults.push(message.text());
  });
  assert.equal((await page.goto(base+'map-of-the-all/',{waitUntil:'domcontentloaded'})).status(),200);
  await live(page,'phone');
  await page.screenshot({path:'atlas-qa-evidence/cinematic-all-phone.png'});
  await page.locator('[data-drawer="nav"]').click();
  assert.ok(await page.locator('#leftPanel').isVisible(),'mobile navigator remains accessible');
  await page.locator('#quality').selectOption('battery');
  assert.equal(await page.locator('#quality').inputValue(),'battery');
  await page.locator('[data-drawer="nav"]').click();
  await live(page,'phone-battery');
  assert.deepEqual(faults,[],'reduced-motion mobile shaders and runtime');
  await context.close();
}
try{
  await ready();
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  assert.equal((await fetch(base)).status,200,'independent root Planner entry remains');
  await checkDesktop();await checkMobile();
  console.log('ATLAS_CINEMATIC_BROWSER_PASS tiers=3 eras=3 selected=true quality=true mobile=true root=true');
}catch(error){
  console.error('ATLAS_CINEMATIC_BROWSER_FAIL',error.stack||error);
  process.exitCode=1;
}finally{
  await browser?.close();server.kill('SIGTERM');
}
process.exit(process.exitCode||0);
