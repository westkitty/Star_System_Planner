/** Pure projection-space placement, with selected labels ahead of collisions. */
export function layoutVisibleLabels(candidates,selectedId,limit=28){
  const cap=Math.max(0,Math.floor(Number.isFinite(limit)?limit:28));
  if(!cap)return [];
  const ranked=candidates.filter(c=>c?.n?.id&&[c.x,c.y,c.d,c.wd,c.ht].every(Number.isFinite)&&c.wd>0&&c.ht>0)
    .sort((a,b)=>Number(b.n.id===selectedId)-Number(a.n.id===selectedId)||a.d-b.d);
  const visible=[];
  for(const next of ranked){
    if(visible.some(p=>Math.abs(next.x-p.x)<(next.wd+p.wd)/2&&Math.abs(next.y-p.y)<(next.ht+p.ht)/2))continue;
    visible.push(next);
    if(visible.length>=cap)break;
  }
  return visible;
}
