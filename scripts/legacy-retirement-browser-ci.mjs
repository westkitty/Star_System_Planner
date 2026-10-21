/** Release-candidate browser proof for the retired legacy Atlas route.
 * Tests disposable Chromium contexts only; never a user's real browser profile.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const base='http://127.0.0.1:4189/Star_System_Planner/';
const key='starsilk.map-of-the-all.draft.v1';
const executablePath=[
  process.env.ATLAS_CHROMIUM,
  '/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
].find(path=>path&&existsSync(path));
if(!executablePath)throw Error('Chromium required for browser proof');
mkdirSync('atlas-qa-evidence',{recursive:true});
const server=spawn(process.execPath,
  ['./node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4189','--strictPort'],
  {stdio:['ignore','pipe','pipe']});
let serverLog='';
for(const stream of [server.stdout,server.stderr])
  stream.on('data',bytes=>serverLog+=String(bytes).slice(0,400));
let browser;
const watchdog=setTimeout(()=>{console.error('LEGACY_RETIREMENT_TIMEOUT');server.kill('SIGTERM');process.exit(124);},165000);
watchdog.unref();
async function ready(){
  for(let i=0;i<80;i++){
    if(server.exitCode!==null)throw Error('Vite preview exited: '+serverLog);
    try{if((await fetch(base+'map-of-the-all/')).ok)return;}catch{}
    await new Promise(done=>setTimeout(done,300));
  }
  throw Error('Preview unavailable: '+serverLog);
}
async function test(){
  await ready();
  browser=await chromium.launch({headless:true,executablePath,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  const errors=[];
  const raw='{"version":1,"draft":"RETIREMENT RAW UTF8 ✓","eras":["war","locking","post"]}';
  const context=await browser.newContext({viewport:{width:1536,height:864},acceptDownloads:true,serviceWorkers:'block'});
  await context.addInitScript(({key,raw})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,raw);},{key,raw});
  const page=await context.newPage();page.on('pageerror',e=>errors.push('retirement:'+e.message));
  assert.equal((await page.goto(base+'map-of-the-all/',{waitUntil:'domcontentloaded',timeout:30000})).status(),200);
  const btn=page.locator('#exportRawDraft');
  await btn.waitFor({timeout:10000});
  assert.equal(await btn.isEnabled(),true);
  assert.equal(await page.locator('#spaceCanvas').count(),0,'Legacy Three.js editor must not be loaded');
  assert.equal(await page.locator('#allLayersBtn').count(),0,'Legacy writer UI must not be present');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),raw);
  const downloadPromise=page.waitForEvent('download',{timeout:12000});
  await btn.click();
  const download=await downloadPromise;
  assert.equal((await readFile(await download.path())).toString('utf8'),raw,
    'Raw backup bytes must not be normalized');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),raw,
    'Retirement page must not mutate shared origin storage');
  assert.equal(await page.locator('a[href="https://westkitty.github.io/Starsilk_Map_of_the_All/"]').count(),1);
  await page.screenshot({path:'atlas-qa-evidence/retired-atlas-desktop.png'});
  await context.close();

  // No old key means no backup; the retirement entry must not create data.
  const empty=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,
    serviceWorkers:'block',acceptDownloads:true});
  const emptyPage=await empty.newPage();emptyPage.on('pageerror',e=>errors.push('empty:'+e.message));
  await emptyPage.goto(base+'map-of-the-all/',{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(await emptyPage.locator('#exportRawDraft').isDisabled(),true);
  assert.equal(await emptyPage.evaluate(key=>localStorage.getItem(key),key),null);
  const mobile=await emptyPage.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    innerWidth,
    buttonHeight:document.querySelector('#exportRawDraft').getBoundingClientRect().height
  }));
  assert.ok(mobile.scrollWidth<=mobile.innerWidth,'Mobile retirement entry must not overflow horizontally');
  assert.ok(mobile.buttonHeight>=44,'Mobile export control must be touch sized');
  await emptyPage.screenshot({path:'atlas-qa-evidence/retired-atlas-mobile.png'});
  await empty.close();

  // Malformed saved JSON must be exported without parser rejection or replacement.
  const broken='{"broken":["unterminated"';
  const bad=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
  await bad.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key,raw:broken});
  const badPage=await bad.newPage();badPage.on('pageerror',e=>errors.push('malformed:'+e.message));
  await badPage.goto(base+'map-of-the-all/',{waitUntil:'domcontentloaded',timeout:30000});
  const brokenDownload=badPage.waitForEvent('download',{timeout:12000});
  await badPage.locator('#exportRawDraft').click();
  assert.equal((await readFile(await (await brokenDownload).path())).toString('utf8'),broken);
  assert.equal(await badPage.evaluate(key=>localStorage.getItem(key),key),broken);
  await bad.close();

  // The root orbital simulator is a protected independent application.
  const root=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const rootPage=await root.newPage();rootPage.on('pageerror',e=>errors.push('planner:'+e.message));
  assert.equal((await rootPage.goto(base,{waitUntil:'domcontentloaded',timeout:30000})).status(),200);
  await rootPage.waitForFunction(()=>document.getElementById('root')?.childElementCount>0,null,{timeout:30000});
  assert.equal(errors.length,0,'No runtime exceptions: '+errors.join(' / '));
  await root.close();
  console.log('LEGACY_RETIREMENT_BROWSER_PASS raw_bytes=true empty_profile=true malformed_backup=true root_planner_mounted=true old_editor_absent=true mobile=true disposable_only=true');
}
try{await test();}
catch(error){console.error('LEGACY_RETIREMENT_BROWSER_FAIL',error.stack||error);process.exitCode=1;}
finally{
  await browser?.close();
  server.kill('SIGTERM');
  clearTimeout(watchdog);
}
