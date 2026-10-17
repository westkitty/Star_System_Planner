/** Phase 3 end-to-end acceptance. Runs only in feature-branch CI, no app runtime dependency. */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const HOST='http://127.0.0.1:4173';
const ATLAS=HOST+'/Star_System_Planner/map-of-the-all/';
const chromePaths=['/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/opt/google/chrome/chrome'];
const chrome=chromePaths.find(existsSync);
if(!chrome)throw new Error('Browser QA blocked: Chromium executable missing (not a passing test)');
mkdirSync('atlas-qa-evidence',{recursive:true});
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';for(const stream of [server.stdout,server.stderr])stream.on('data',c=>output+=String(c).slice(0,1200));
let browser;
function expect(cond,msg){if(!cond)throw new Error('Acceptance failure: '+msg);}
async function ready(){for(let i=0;i<55;i++){
 if(server.exitCode!==null)throw Error('Vite preview exited: '+output);
 try{const r=await fetch(ATLAS);if(r.ok)return;}catch{}
 await new Promise(r=>setTimeout(r,250));
}throw new Error('Vite server not ready: '+output);}
function rectCenter(b){return{x:b.x+b.width/2,y:b.y+b.height/2};}
async function drag(page,b,dx,dy){
 const a=rectCenter(b);await page.mouse.move(a.x,a.y);await page.mouse.down();
 await page.mouse.move(a.x+dx,a.y+dy,{steps:9});await page.mouse.up();
}
async function test(){await ready();
 browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
 const context=await browser.newContext({viewport:{width:1536,height:864},reducedMotion:'reduce',acceptDownloads:true});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push('PAGE '+e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push('CONSOLE '+m.text())});
 await page.goto(ATLAS,{waitUntil:'domcontentloaded',timeout:20000});
 await page.locator('.world-label').first().waitFor({timeout:30000});
 expect(await page.locator('[data-studio-mode]').count()===4,'all 4 tool modes present');
 await page.screenshot({path:'atlas-qa-evidence/phase3-desktop-overview.png'});
 await page.locator('.node-btn').filter({hasText:'PERSEUS CONFLUENCE'}).click();
 await page.locator('[data-studio-mode="move"]').click();
 const handle=page.locator('#studioMoveHandle');await handle.waitFor({state:'visible',timeout:10000});
 const before=await page.locator('#objX').inputValue();
 await drag(page,await handle.boundingBox(),52,28);
 await page.waitForTimeout(250);
 const after=await page.locator('#objX').inputValue();
 expect(before!==after,'drag commits draft coordinate after pointer release');
 await page.keyboard.press('Control+z');
 expect(await page.locator('#objX').inputValue()===before,'one undo restores position');
 // Label offset is optional v1 field, must survive export and reload.
 await page.locator('[data-studio-mode="label"]').click();
 const label=page.locator('.world-label[data-atlas-id="perseus-confluence"]');
 await label.waitFor({state:'visible',timeout:10000});
 await drag(page,await label.boundingBox(),45,-24);
 await page.waitForTimeout(350);
 const offset=await page.evaluate(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')).nodes.find(n=>n.id==='perseus-confluence').label.offset);
 expect(Array.isArray(offset)&&offset.some(x=>Math.abs(x)>.002),'label drag persists normalized offset');
 await page.reload({waitUntil:'domcontentloaded',timeout:16000});
 await page.locator('.world-label').first().waitFor({timeout:20000});
 const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')).nodes.find(n=>n.id==='perseus-confluence').label.offset);
 assert.deepEqual(restored,offset);
 // Pure presentation lenses never mutate draft content.
 const select=page.locator('#studioLens');await select.selectOption('cartographer');
 expect(await page.locator('#atlas').getAttribute('data-lens')==='cartographer','cartographer lens is applied');
 await select.selectOption('signal');
 expect(await page.locator('#atlas').getAttribute('data-lens')==='signal','signal lens is applied');
 // Route source/target must match tier and be non-canonical drafts.
 await page.locator('[data-studio-mode="route"]').click();
 const routeCount=await page.evaluate(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')).routes.length);
 await page.locator('.node-btn').filter({hasText:'NORTH REACH'}).click();
 expect(await page.locator('.studio-route-preview').isVisible(),'route preview appears when origin selected');
 await page.locator('.node-btn').filter({hasText:'SOUTHERN TERRITORIES'}).click();
 await page.waitForTimeout(400);
 const routes=await page.evaluate(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')).routes.length);
 expect(routes===routeCount+1,'one proposed corridor created');
 await page.locator('.node-btn').filter({hasText:'NORTH REACH'}).click();
 await page.locator('.node-btn').filter({hasText:'SOUTHERN TERRITORIES'}).click();
 await page.waitForTimeout(400);
 const unique=await page.evaluate(()=>JSON.parse(localStorage.getItem('starsilk.map-of-the-all.draft.v1')).routes.length);
 expect(unique===routes,'duplicate route rejected');
 await page.locator('#studioCancelRoute').click();
 expect(!(await page.locator('.studio-route-preview').isVisible()),'cancel discards pending route');
 await page.screenshot({path:'atlas-qa-evidence/phase3-editor-desktop.png'});
 // The existing parent remains served at the same URL.
 const parent=await page.goto(HOST+'/Star_System_Planner/',{waitUntil:'domcontentloaded',timeout:15000});expect(parent.status()===200,'parent app responds 200');
 await context.close();
 const mobile=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const p=await mobile.newPage();p.on('pageerror',e=>errors.push('MOBILE '+e.message));
 await p.goto(ATLAS,{waitUntil:'domcontentloaded',timeout:18000});await p.locator('[data-studio-mode="move"]').waitFor();
 const dimensions=await p.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('[data-studio-mode]')].map(b=>b.getBoundingClientRect().height)}));
 expect(dimensions.scroll<=dimensions.w,'mobile no horizontal overflow');
 expect(dimensions.buttons.every(h=>h>=40),'mobile editing controls minimum 40 CSS px');
 await p.locator('[data-studio-mode="move"]').click();
 expect(await p.locator('#studioMoveSettings').isVisible(),'touch viewport exposes snap and axis controls');
 await p.screenshot({path:'atlas-qa-evidence/phase3-mobile-studio.png'});
 await mobile.close();
 expect(errors.length===0,'no uncaught browser JS errors: '+errors.join('; '));
 console.log('PHASE3_BROWSER_PASS '+JSON.stringify({labels:true,moveUndo:true,labelSaved:true,routeOnce:true,mobile:dimensions,errors}));
}
try{await test()}catch(e){console.error('PHASE3_BROWSER_FAIL',e.stack||e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
