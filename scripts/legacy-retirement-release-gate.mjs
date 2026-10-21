/** Default-deny release fence for retiring the legacy Atlas entrypoint.
 * No browser data is inspected here. Review receipts before approving any SHA.
 */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const expected=['owner_backup_restore','retired_writer_and_stale_tabs','legacy_v1_cross_import',
  'independent_planner_browser','rollback_rehearsal','canon_era_integrity'];
const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
let m;
try{m=JSON.parse(readFileSync(new URL('../docs/LEGACY_ATLAS_CUTOVER_READINESS.json',import.meta.url),'utf8'));}
catch(e){console.error('LEGACY_ATLAS_RELEASE_BLOCKED manifest unreadable:',e.message);process.exit(1);}
const fail=[];
if(m.schemaVersion!==1||m.productionTarget!=='westkitty/Star_System_Planner'||
 m.retiredEntry!=='map-of-the-all/index.html'||m.storageKey!=='starsilk.map-of-the-all.draft.v1'||m.draftVersion!==1)
 fail.push('Unexpected identity, legacy entry or draft version');
const actual=process.env.GITHUB_SHA,approved=process.env.LEGACY_RETIRE_APPROVED_SHA;
if(!sha(actual)||!sha(approved)||actual!==approved)
 fail.push('Owner-approved exact release SHA absent or mismatched');
for(const key of expected){
  const proof=m.proofs?.[key];
  if(proof?.status!=='verified'||typeof proof.receipt!=='string'||proof.receipt.length<12||/[\r\n<>]/.test(proof.receipt))
    fail.push('Missing verified proof: '+key);
}
// One-time, narrowly scoped owner-authorized disposal of *old draft data*.
// This does not falsely certify any of the intentionally blocked recovery proofs.
function authorizedDisposableDraftCutover(){
  const d=m.disposableDraftCutover;
  if(d?.mode!=='temporary-disposable-draft-release'||typeof d.authorization!=='string'||
    !d.authorization.includes('Ignore the previous data in the atlas')||
    d.scope?.indexOf('pre-cutover legacy Atlas browser draft')<0||
    d.retiredEntrypointBlob!=='0b9f96f7f90c893fa3e8ee1c706c7e1af2646ef8'||
    d.releaseWindowEndUTC!=='2026-10-23T00:00:00Z')return false;
  if(process.env.GITHUB_REPOSITORY!=='westkitty/Star_System_Planner'||
    process.env.GITHUB_REF!=='refs/heads/main'||
    process.env.GITHUB_EVENT_NAME!=='push'||!sha(process.env.GITHUB_SHA)||
    Date.now()>=Date.parse(d.releaseWindowEndUTC))return false;
  // Exact artifact identity: do not permit waiver if the legacy writer is loaded again.
  let blob='';
  try{blob=execFileSync('git',['rev-parse','HEAD:map-of-the-all/index.html'],
    {encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
  catch{return false;}
  const entry=readFileSync(new URL('../map-of-the-all/index.html',import.meta.url),'utf8');
  if(blob!==d.retiredEntrypointBlob||!entry.includes('READ-ONLY LEGACY ENTRY')||
    !entry.includes('id="exportRawDraft"')||entry.includes('src="./main.js"'))
    return false;
  if(!expected.every(key=>m.proofs?.[key]?.status==='blocked'&&m.proofs[key].receipt===null))
    return false;
  console.log('LEGACY_ATLAS_DISPOSABLE_DRAFT_RELEASE_AUTHORIZED',process.env.GITHUB_SHA,
    'owner waived only recovery of pre-cutover throwaway drafts; browser and Planner QA must still pass');
  return true;
}
if(fail.length&&authorizedDisposableDraftCutover())process.exit(0);
if(fail.length){
  console.error('LEGACY_ATLAS_RELEASE_BLOCKED',fail.join(' | '));
  console.error('No Pages deployment. Back up and independently restore real drafts, retire cached writers, rehearse rollback, then approve the exact SHA.');
  process.exit(1);
}
console.log('LEGACY_ATLAS_RELEASE_READY',actual);
