/** Default-deny release fence for retiring the legacy Atlas entrypoint.
 * No browser data is inspected here. Review receipts before approving any SHA.
 */
import {readFileSync} from 'node:fs';
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
if(fail.length){
  console.error('LEGACY_ATLAS_RELEASE_BLOCKED',fail.join(' | '));
  console.error('No Pages deployment. Back up and independently restore real drafts, retire cached writers, rehearse rollback, then approve the exact SHA.');
  process.exit(1);
}
console.log('LEGACY_ATLAS_RELEASE_READY',actual);
