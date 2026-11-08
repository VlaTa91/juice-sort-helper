/* Automatic recognition of tube puzzles. Input: canvas normalized to 351 x 768. */
function autoRecognizeGame(canvas){
 const width=351,height=768;
 const data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height).data;
 function medianRGB(x,y){
  const rows=[[],[],[]];
  for(let py=Math.max(0,Math.round(y)-3);py<=Math.min(height-1,Math.round(y)+3);py++)
   for(let xx=Math.max(0,Math.round(x)-11);xx<=Math.min(width-1,Math.round(x)-6);xx++){
    const i=(py*width+xx)*4;
    rows[0].push(data[i]);rows[1].push(data[i+1]);rows[2].push(data[i+2]);
   }
  return rows.map(r=>{r.sort((a,b)=>a-b);return r[Math.floor(r.length/2)]});
 }
 const intensity=(x,y)=>{const i=(y*width+x)*4;return .299*data[i]+.587*data[i+1]+.114*data[i+2]};
 const edges=[];
 for(let x=0;x<width-1;x++){
  let sum=0;
  for(let y=408;y<=515;y++)sum+=Math.abs(intensity(x+1,y)-intensity(x,y));
  edges[x]=sum/108;
 }
 function edgeAt(x){let best=0;for(let i=Math.max(0,Math.round(x)-3);i<=Math.min(width-2,Math.round(x)+3);i++)best=Math.max(best,edges[i]);return best}

 const topEdges=[];
 for(let x=0;x<width-1;x++){
   let sum=0;
   for(let y=245;y<330;y++)sum+=Math.abs(intensity(x+1,y)-intensity(x,y));
   topEdges[x]=sum/85;
 }
 function topEdgeAt(x){let best=0;for(let j=Math.max(0,Math.round(x)-3);j<=Math.min(width-2,Math.round(x)+3);j++)best=Math.max(best,topEdges[j]);return best}
 const layouts=[];
 for(let n=2;n<=6;n++)for(let xshift=-18;xshift<=18;xshift+=3){
   const centers=Array.from({length:n},(_,i)=>175+xshift+(i-(n-1)/2)*50);
   const strength=centers.map(x=>Math.min(edgeAt(x-16),edgeAt(x+16)));
   const average=strength.reduce((a,b)=>a+b,0)/n;
   const min=Math.min(...strength);
   if(min<8)continue;
   const topStrength=[50,100,150,200,250,300].map(x=>Math.min(topEdgeAt(x+xshift-18),topEdgeAt(x+xshift+18)));
   const topAverage=topStrength.reduce((a,b)=>a+b,0)/6;
   layouts.push({n,centers,xshift,average,min,topAverage,score:average+1.5*n+topAverage*1.2});
 }
 layouts.sort((a,b)=>b.score-a.score);
 // Alternative geometric detection below also handles empty bottom tubes.
 const reference={
  '0':[[148,133,74],[120,116,80],[125,109,74],[119,97,47]],
  '1':[[134,158,195],[112,130,175],[97,135,159],[81,120,151]],
  '2':[[208,152,113],[153,92,57],[177,123,85],[180,99,39]],
  '3':[[134,165,127],[69,164,110]],
  '5':[[75,116,69],[67,117,64],[39,90,48],[101,127,97],[33,101,32]],
  '6':[[219,167,212],[212,156,204],[202,154,193]],
  '7':[[80,60,150],[67,52,135]],
  '8':[[215,188,144],[156,141,110],[178,157,111],[164,134,92]],
  '9':[[152,153,148],[146,139,136],[122,118,115]],
  '10':[[179,107,103],[142,75,70],[156,55,59],[149,85,76]]
 };
 function classify([r,g,b]){
  // Saturated pink must not be mistaken for a gray dash (tube 7 regression).
  if(r>=170&&r-g>30&&b-g>24&&b>r-65)return '6';
  if(g>=r+3&&Math.abs(g-b)<19&&r+g+b<345)return '_';
  // Empty glass is neutral dark green, not a hidden brown layer.
  if(Math.max(r,g,b)<=110&&Math.abs(r-g)<22&&Math.abs(g-b)<24&&(b>=r-6||g>=r-1))return '_';
  if(r>50&&r<145&&r-g>11&&g-b>1&&g-b<29&&g<113&&b<94)return '?';
  if(Math.abs(r-g)<13&&Math.abs(g-b)<15&&r>111&&r<190)return '9';
  let bestType='X',bestDist=Infinity;
  for(const [name,samples] of Object.entries(reference))
   for(const p of samples){
    const d=Math.hypot(r-p[0],g-p[1],b-p[2]);
    if(d<bestDist){bestDist=d;bestType=name}
   }
  // A gray dash must be genuinely neutral. A colored tile's edge can
  // otherwise match the old gray RGB reference (notably pink tube #7).
  if(bestType==='9'&&Math.max(r,g,b)-Math.min(r,g,b)>24)return 'X';
  return bestDist>53?'X':bestType;
 }
 // Read both clean side margins, avoiding the symbol drawn in the centre.
 // Using a single left margin previously confused pink with gray when
 // slight screenshot translations placed the sample on the glass border.
 function sampleTile(x,y){
  const left=medianRGB(x,y),right=medianRGB(x+17,y);
  const a=classify(left),b=classify(right);
  if(a===b)return a;
  if(a==='X')return b;
  if(b==='X')return a;
  if(a==='?'||a==='_')return b==='?'||b==='_'?'X':b;
  if(b==='?'||b==='_')return a;
  const distances=Object.entries(reference).map(([type,refs])=>({
   type,
   dist:[left,right].reduce((total,rgb)=>total+
    Math.min(...refs.map(p=>Math.hypot(rgb[0]-p[0],rgb[1]-p[1],rgb[2]-p[2]))),0)
  })).sort((a,b)=>a.dist-b.dist);
  return distances[0].dist<100?distances[0].type:'X';
 }
 function scanCandidate(chosen,shiftX,shiftY){
 const xs=chosen.geometry
  ? [50,100,150,200,250,300].map(x=>x+chosen.geometry.shift).concat(chosen.centers)
  : [50,100,150,200,250,300,...chosen.centers.map(x=>x-chosen.xshift)];
 const topYs=chosen.geometry?.topYs||[257,285,313,338],bottomYs=chosen.geometry?.bottomYs||[416,445,473,501],state=[],rawRows=[];
 let bad=0,visible=0,hidden=0,filled=0;
 for(let i=0;i<xs.length;i++){
  const yy=i<6?topYs:bottomYs;
  const slots=yy.map(y=>sampleTile(xs[i]+shiftX,y+shiftY));
  // The first layer of the lower row is around y=416. The previous
  // y=430 sample hit the hidden brown cell below the pink/orange tile.
  // A margin inside the tile is essential for reliable color recognition.
 // A real stack cannot have its two lowest layers empty.
  // This also rejects floating in-game badges above empty tubes.
  if(slots[2]==='_'&&slots[3]==='_')slots.fill('_');
  let started=false,gap=false;
  for(const c of slots){if(c!=='_')started=true;else if(started)gap=true}
  const tube=slots.filter(c=>c!=='_').reverse();
  if(gap||tube.includes('X'))bad++;
  for(const label of tube){if(label==='?')hidden++;else visible++}
  if(tube.length)filled++;
  state.push(tube);rawRows.push(slots);
 }
 // Fully open levels need their own brighter color references.
 // On heavily hidden levels, foreign game overlays may cover masked layers.
 // Preserve them as unknown; do not invent red/orange tiles under overlay badges.
 // For the initial 12-tube masked stage, only the upper token is visible.
 // Infer the *hidden status*, never a concealed symbol/color. A compressed
 // screenshot may make concealed brown tiles look like colored symbols.
 const fullTubes=state.filter(t=>t.length===4);
 const maskedStart=chosen.n===6&&state.length===12&&filled===10
   &&fullTubes.length===10&&hidden>=8
   &&fullTubes.every(t=>t[3]!=='X'&&t[3]!=='?'&&t[3]!=='_')
   &&fullTubes.every(t=>t.slice(0,3).every(v=>v==='?'));
 if(maskedStart){
   for(let i=0;i<state.length;i++)if(state[i].length===4){
     state[i]=['?','?','?',state[i][3]];
   }
   bad=0;visible=10;hidden=30;
 }else if(hidden>0&&filled>=6&&hidden>=(filled-1)*3){
   for(let i=0;i<state.length;i++){
     const tube=state[i];
     if(tube.length===4&&tube[3]!=='X'&&tube[3]!=='?')
       state[i]=['?','?','?',tube[3]];
   }
   bad=state.some(t=>t.includes('X'))?bad:0;
   visible=state.reduce((n,t)=>n+t.filter(v=>v!=='?').length,0);
   hidden=state.reduce((n,t)=>n+t.filter(v=>v==='?').length,0);
 }
 if(hidden===0&&chosen.n===3&&state.reduce((n,t)=>n+t.length,0)===28){
  const visiblePalette={
   '9':[[158,156,152],[159,158,154],[152,153,149],[149,147,144]],
   '10':[[164,39,35],[170,57,55],[146,45,45],[157,37,39]],
   '2':[[202,96,30],[202,105,46],[200,94,31],[179,93,47]],
   '8':[[217,181,129],[218,175,119],[212,169,119],[180,158,120]],
   '0':[[141,112,55],[133,101,44],[143,121,78],[149,122,66]],
   '1':[[99,142,195],[75,133,195],[105,143,186],[98,146,175]],
   '5':[[33,101,32],[26,111,30],[42,116,46],[58,111,38]]
  };
  function visibleType(rgb){
   let best='X',dist=Infinity;
   for(const [type,refs] of Object.entries(visiblePalette))
    for(const p of refs){
     const d=Math.hypot(rgb[0]-p[0],rgb[1]-p[1],rgb[2]-p[2]);
     if(d<dist){best=type;dist=d}
    }
   return dist<55?best:'X';
  }
  bad=0;
  for(let i=0;i<9;i++){
   if(rawRows[i].every(t=>t==='_')){state[i]=[];continue}
   const ys=i<6?topYs:[418,448,476,501];
   state[i]=ys.map(y=>visibleType(medianRGB(xs[i]+shiftX,y+shiftY))).reverse();
   if(state[i].includes('X'))bad++;
  }
  const counts={};
  state.flat().forEach(c=>counts[c]=(counts[c]||0)+1);
  if(Object.values(counts).some(n=>n!==4))bad++;
 }
 const unknownTop=state.filter(t=>t.length&&t.at(-1)==='?').length;
 let mismatch=0;
 if(hidden===0&&chosen.n===3){
   const counts={};state.flat().forEach(t=>counts[t]=(counts[t]||0)+1);
   mismatch=Object.values(counts).some(c=>c!==4)?1:0;
 }
 const valid=bad===0&&unknownTop===0&&mismatch===0&&filled>=2&&visible>0;
 return {valid,state,count:xs.length,bottomCount:chosen.n,visible,hidden,filled,unknownTop,bad,
  layoutScore:chosen.score,
  reason:valid?'':('Нужно проверить символы: '+bad+', нераспознанных верхних слоёв: '+unknownTop),
  shiftX,shiftY};
 }
 // Find the two REAL tube rows by their continuous vertical glass borders.
 // Coordinates from an older phone layout must not dictate which layers are sampled.
 function sideEdge(x,y){
  x=Math.round(x);y=Math.round(y);
  if(x<20||x>=width-20||y<0||y>=height)return 0;
  let left=0,right=0;
  for(let d=-17;d<=-13;d++)left=Math.max(left,Math.abs(intensity(x+d+1,y)-intensity(x+d,y)));
  for(let d=12;d<=17;d++)right=Math.max(right,Math.abs(intensity(x+d+1,y)-intensity(x+d,y)));
  return left+right;
 }
 function strength(x,band){
  let total=0,n=0;
  for(let y=band.start+12;y<=band.end-8;y+=4){total+=sideEdge(x,y);n++}
  return n?total/n:0;
 }
 function detectRows(){
  let best=null;
  for(let shift=-12;shift<=12;shift+=3){
   const row=[];
   for(let y=90;y<=600;y++){
    let n=0;for(const x of [50,100,150,200,250,300])n+=sideEdge(x+shift,y);
    row.push(n/6);
   }
   const smooth=row.map((_,i)=>{
    let n=0,count=0;for(let k=Math.max(0,i-2);k<=Math.min(row.length-1,i+2);k++){n+=row[k];count++}
    return n/count;
   });
   const bands=[];
   let start=-1,last=-1;
   for(let i=0;i<=smooth.length+8;i++){
    if(i<smooth.length&&smooth[i]>22){if(start<0)start=i;last=i}
    if(start>=0&&(i>=smooth.length||i-last>8)){
     if(last-start>=85){
      const startY=start+90,endY=last+90;
      const mean=smooth.slice(start,last+1).reduce((a,b)=>a+b,0)/(last-start+1);
      if(endY-startY<=190&&mean>24)bands.push({start:startY,end:endY,mean});
     }
     start=-1;last=-1;
    }
   }
   for(let i=0;i<bands.length;i++)for(let j=i+1;j<bands.length;j++){
    const a=bands[i],b=bands[j];
    if(b.start-a.end<45||b.start-a.start>305)continue;
    const score=(a.mean*(a.end-a.start)+b.mean*(b.end-b.start));
    if(!best||score>best.score)best={top:a,bottom:b,shift,score};
   }
  }
  if(!best)return null;
  const slots=band=>Array.from({length:4},(_,j)=>
   Math.round(band.start+(j+.65)*(band.end-band.start)/4));
  best.topYs=slots(best.top);best.bottomYs=slots(best.bottom);
  return best;
 }
 // Try complete layouts first. An empty tube still has glass borders, so
 // returning the first two-tube match silently dropped the other four tubes.
 const detected=detectRows();
 if(detected){
  const candidates=[];
  for(let n=2;n<=6;n++)for(const correction of [-3,0,3]){
   const centers=Array.from({length:n},(_,i)=>
    175+detected.shift+correction+(i-(n-1)/2)*50);
   const strengths=centers.map(x=>strength(x,detected.bottom));
   if(Math.min(...strengths)<17)continue;
   const score=strengths.reduce((a,b)=>a+Math.max(0,b-15),0);
   candidates.push({n,centers,xshift:0,score,geometry:detected});
  }
  candidates.sort((a,b)=>b.score-a.score);
  let uncertain=null;
  for(const chosen of candidates)for(const dy of [0,-2,2,-4,4]){
   const found=scanCandidate(chosen,0,dy);
   const total=found.state.reduce((n,t)=>n+t.length,0);
   const actual=found.state.flat().filter(c=>c!=='?'&&c!=='X');
   const knownCounts={};
   for(const token of actual)knownCounts[token]=(knownCounts[token]||0)+1;
   const plausible=total%4===0&&total>=8&&
    Object.keys(knownCounts).length<=total/4&&
    Object.values(knownCounts).every(n=>n<=4);
   if(found.valid&&plausible)return found;
   // A partial 12-tube read is preferable to a confidently wrong 8-tube read.
   if((!uncertain||found.count>uncertain.count||found.count===uncertain.count&&
      found.bad+found.unknownTop<uncertain.bad+uncertain.unknownTop)&&
      (plausible||found.count===12))uncertain=found;
  }
  if(uncertain)return {...uncertain,valid:false,reason:'Проверь неуверенные слои; все найденные колбочки сохранены'};
 }

 let best=null;
 const shifts=[0,-3,3,-6,6,-9,9,-12,12,-16,16,-20,20,-24,24,-28,28];
 for(const chosen of layouts.slice(0,24)){
   for(const dy of shifts){
     for(const dX of [0,-3,3]){
       const candidate=scanCandidate(chosen,chosen.xshift+dX,dy);
       if(candidate.valid)return candidate;
       const score=candidate.bad*100+candidate.unknownTop*70+Math.abs(dX)+Math.abs(dy)+Math.max(0,layouts[0].score-chosen.score);
       if(!best||score<best.score)best={...candidate,score};
     }
   }
 }
 return best||{valid:false,reason:'Изображение не удалось распознать'};
}