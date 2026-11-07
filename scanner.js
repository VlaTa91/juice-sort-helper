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
 if(!layouts.length)return {valid:false,reason:'Не найдены границы нижнего ряда колбочек'};
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
  if(g>=r+3&&Math.abs(g-b)<19&&r+g+b<345)return '_';
  if(r>50&&r<145&&r-g>11&&g-b>1&&g-b<29&&g<113&&b<94)return '?';
  if(Math.abs(r-g)<13&&Math.abs(g-b)<15&&r>111&&r<190)return '9';
  let bestType='X',bestDist=Infinity;
  for(const [name,samples] of Object.entries(reference))
   for(const p of samples){
    const d=Math.hypot(r-p[0],g-p[1],b-p[2]);
    if(d<bestDist){bestDist=d;bestType=name}
   }
  return bestDist>53?'X':bestType;
 }
 function scanCandidate(chosen,shiftX,shiftY){
 const xs=[50,100,150,200,250,300,...chosen.centers.map(x=>x-chosen.xshift)];
 const topYs=[257,285,313,338],bottomYs=[430,458,483,503],state=[],rawRows=[];
 let bad=0,visible=0,hidden=0,filled=0;
 for(let i=0;i<xs.length;i++){
  const yy=i<6?topYs:bottomYs;
  const slots=yy.map(y=>classify(medianRGB(xs[i]+shiftX,y+shiftY)));
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
   &&fullTubes.every(t=>t[3]!=='X'&&t[3]!=='?'&&t[3]!=='_');
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