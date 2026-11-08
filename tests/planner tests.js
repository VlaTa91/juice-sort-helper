/* Run: node "tests/planner tests.js"
   Deterministic browser-independent regression tests and complete simulations. */
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const code=fs.readFileSync(path.join(root,"planner.js"),"utf8");
const sandbox={window:{}};vm.runInNewContext(code,sandbox);
const P=sandbox.window.JuicePlanner;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function simulate(seed,colors,iterations=240){
 const r=P.rngSeed(seed),bag=[];
 for(let i=0;i<colors;i++)for(let k=0;k<4;k++)bag.push(String(i));
 for(let i=bag.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}
 let full=Array.from({length:colors},(_,i)=>bag.slice(i*4,i*4+4)).concat([[],[]]);
 let observed=full.map(t=>t.length?["?","?","?",t[3]]:[]),history=[],moves=0,stop=null;
 for(;moves<110&&!P.solved(full,4);moves++){
  const decision=P.choose(observed,{capacity:4,simulations:iterations,depth:28,
    seed:seed*101+moves,visited:history});
  if(!decision.move){stop=decision.reason;break}
  assert(P.legal(observed,4).some(m=>equal(m,decision.move)),"Illegal move proposed");
  history.push(JSON.stringify(observed));
  const step=P.after(observed,full,decision.move);
  full=step.world;observed=step.obs;
  assert(full.every((t,i)=>t.length===observed[i].length),"Layer count mismatch");
  for(let i=0;i<full.length;i++)for(let j=0;j<full[i].length;j++)
   assert(observed[i][j]==="?"||observed[i][j]===full[i][j],"Revealed value mismatch");
 }
 return {win:P.solved(full,4),moves,stop}
}
function testBasics(){
 const b=[["?","?","?","1"],["?","?","?","2"],["?","?","?","3"],["?","?","?","4"],[],[]];
 const deck=P.deck(b,4,[]);
 assert(deck&&deck.unknown===12&&deck.nColors===4,"Prior color count wrong");
 assert(Object.values(deck.remaining).every(n=>n===3),"Prior color probabilities wrong");
 const r=P.rngSeed(123),world=P.sample(b,deck.bag,r);
 assert(world.flat().filter(v=>v==="1").length===4,"Sampling violates color count");
 const m=P.legal(b,4)[0],next=P.after(b,world,m);
 assert(next.reveal!==null&&next.obs[m[0]].at(-1)===next.reveal,"Did not uncover ? after pour");
 assert(P.legal([["?","1"],["?"],[]],4).every(m=>m[0]===0),"Moved hidden top");
 const decision=P.choose(b,{capacity:4,simulations:140});
 assert(decision.move&&decision.reason==="belief-mcts","Missing plan for hidden board");
 const forbidden=P.legal(b,4)[0],avoid=P.choose(b,{simulations:140,visited:[JSON.stringify(P.move(b,forbidden))]});
 assert(avoid.move&&!equal(avoid.move,forbidden),"Ignored visited state");
}
function testScannerColors(){
 const scanner=fs.readFileSync(path.join(root,"scanner.js"),"utf8");
 const match=scanner.match(/function classify\(\[r,g,b\]\)\{([\s\S]*?)\n \}/);
 assert(match,"Classification function not found");
 const classify=Function("reference","return function classify([r,g,b]){"+match[1]+"\n}")({
  "6":[[219,167,212]],"9":[[152,153,148]]});
 assert.equal(classify([230,174,224]),"6","Tube 7 pink misidentified");
 assert.equal(classify([229,169,212]),"6","Pink top token misidentified");
 assert.equal(classify([154,159,160]),"9","Gray dash misidentified");
}
function testScannerDynamicRows(){
 // Regression for the user screenshot: 12 tubes, 10 occupied and 2 empty,
 // several previously uncovered layers in the first row.
 const source=fs.readFileSync(path.join(root,"scanner.js"),"utf8");
 const width=351,height=768,pixels=new Uint8ClampedArray(width*height*4);
 function rect(x0,y0,x1,y1,rgb){
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   if(x<0||x>=width||y<0||y>=height)continue;
   const off=(y*width+x)*4;
   pixels[off]=rgb[0];pixels[off+1]=rgb[1];pixels[off+2]=rgb[2];pixels[off+3]=255;
  }
 }
 rect(0,0,width-1,height-1,[28,47,43]);
 const sample={
  "10":[184,80,80],"6":[241,167,228],"1":[105,150,205],
  "3":[120,165,110],"7":[72,60,134],"8":[220,180,120],
  "2":[211,111,49],"5":[34,113,33],"0":[132,105,50],
  "9":[154,154,152],"?":[90,53,39],"_":[55,68,66]
 };
 const first=[
  ["10","6","?","?"],["10","3","7","?"],["1","8","?","?"],
  ["6","2","?","?"],["7","3","8","?"],["7","6","5","8"]
 ];
 const second=[
  ["5","6","2","0"],["5","3","9","?"],["0","10","?","?"],
  ["1","2","9","?"],["_","_","_","_"],["_","_","_","_"]
 ];
 for(const [row,top] of [[first,182],[second,382]]){
  for(let i=0;i<6;i++){
   const x=50+50*i;
   for(let j=0;j<4;j++)rect(x-14,top+34*j,x+14,top+34*j+33,sample[row[i][j]]);
   rect(x-16,top-2,x-15,top+136,[178,185,180]);
   rect(x+15,top-2,x+16,top+136,[178,185,180]);
  }
 }
 const env={};vm.runInNewContext(source,env);
 const canvas={getContext:()=>({getImageData:()=>({data:pixels})})};
 const result=env.autoRecognizeGame(canvas);
 assert.equal(result.count,12,"Scanner discarded lower empty tubes");
 assert.equal(result.valid,true,"Scanner should recognize complete known tokens: "+result.reason);
 assert.equal(result.filled,10,"Scanner should preserve 10 occupied tubes");
 assert.equal(result.hidden,12,"Scanner must not re-hide the already discovered pieces");
 assert.equal(result.state[0].join(","),["?","?","6","10"].join(","));
 assert.equal(result.state[6].join(","),["0","2","6","5"].join(","));
 assert.equal(result.state[9].join(","),["?","9","2","1"].join(","));
 assert.equal(result.state[10].length,0);
 assert.equal(result.state[11].length,0);
}

function testPreferShorterSource(){
 // Both red crosses are on top. Pour 9 -> 8 instead of 8 -> 9:
 // the former leaves only one unknown piece in tube 9.
 const board=[
  ["?","?","?","6"],["?","?","2"],["?","?","?","6"],
  ["?","?","?","3"],["?","?","5"],["?","?","?","3"],
  ["?","?","0","0"],["?","?","10"],["?","10"],
  ["1","1"],["7","7","7"]
 ];
 const moves=P.legal(board,4);
 assert(moves.some(m=>m.join()==="7,8,1"),"Expected 8 -> 9 to be legal");
 assert(moves.some(m=>m.join()==="8,7,1"),"Expected 9 -> 8 to be legal");
 const compact=P.preferCompactMoves(board,moves);
 assert(!compact.some(m=>m.join()==="7,8,1"),"Dominated move 8 -> 9 still present");
 assert(compact.some(m=>m.join()==="8,7,1"),"Useful move 9 -> 8 missing");
 const chosen=P.choose(board,{capacity:4,simulations:80,depth:12,seed:1234});
 assert(chosen.move,"No move selected on a valid 9-color board");
 assert.notEqual(chosen.move.join(),"7,8,1","Planner selected inferior reverse direction");
}
function testFinishPurpleBeforeBlue(){
 // Exact visible topology from level 5 after one purple token is moved:
 // tube 4 has one exposed lightning with a hidden layer underneath;
 // tube 11 has three lightning tokens and tube 10 has only two blue squares.
 // The 4 -> 11 pour finishes a full known color and reveals a layer.
 const b=[
  ["?","?","?","6"],["?","?","2"],["?","?","?","6"],
  ["?","7"],["?","?","5","5"],["?","?","?","5"],
  ["?","?","0","0"],["?","8"],["?","?","10","10"],
  ["1","1"],["7","7","7"]
 ];
 assert.equal(b.flat().length,36);
 const forced=P.choose(b,{capacity:4,simulations:340,depth:28,seed:54321});
 assert.equal(forced.reason,"guaranteed-completion");
 assert.equal(forced.move.join(","),"3,10,1","Must fill purple tube 11 using tube 4, not pour blue");
 const after=P.move(b,forced.move);
 assert(after[10].every(x=>x==="7")&&after[10].length===4);
 assert.equal(after[3].length,1,"Only the hidden layer remains in tube 4");
}
function testHeartColorSamples(){
 const scanner=fs.readFileSync(path.join(root,"scanner.js"),"utf8");
 const match=scanner.match(/function classify\(\[r,g,b\]\)\{([\s\S]*?)\n \}/);
 assert(match,"Classification function not found");
 const fn=Function("reference","return function classify([r,g,b]){"+match[1]+"\n}")({
  "3":[[134,165,127],[69,164,110]],
  "5":[[75,116,69],[39,90,48],[33,101,32]]
 });
 assert.equal(fn([12,103,14]),"5","Dark green heart tile was read incorrectly");
 assert.equal(fn([134,179,134]),"3","Bright heart glyph looks like pale green");
 assert(scanner.includes("for(const offset of [-7,-3,3,7])"),
  "Scanner must sample tile edges above and below bright symbol overlays");
}
function testStablePalette(){
 const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
 assert(!html.includes("body:has(>#palette.editing)>#board"),
  "Opening the palette must not reposition or resize the board");
 assert(!html.includes("$('palette').scrollIntoView"),
  "Opening the palette must not trigger auto-scrolling");
 assert(html.includes("Reserve the palette area on every render"),
  "Board should always reserve space for the palette");
 assert(html.includes("window.resizeTo(size.width,size.height)"),
  "Desktop PWA needs a size-to-BlueStacks action");
 assert(html.includes("width:554,height:958"),
  "Keep the compact desktop window dimensions near BlueStacks");
 assert(html.includes("analysis.reason==='guaranteed-completion'"),
  "Guaranteed completion needs an explanation in the PWA");
 assert(html.includes("reasonNode.id='moveReason'"),
  "The app should display the purpose of each suggestion");
}

async function testJournal(){
 const memory=new Map(),storage={
  getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
 const g={window:{},localStorage:storage};
 vm.runInNewContext(fs.readFileSync(path.join(root,"journal.js"),"utf8"),g);
 const j=g.window.JuiceJournal;
 const s=[["?","?","?","1"],[]];
 j.start(s,{source:"test"});j.record("move",{from:1,to:2},[["?","?","1"],["1"]]);
 j.record("reveal",{tube:1,color:"2"},[["?","2","1"],["1"]]);
 j.finish("won",[["1","1","1","1"],[]]);
 const runs=await j.all();
 assert.equal(runs.length,1);assert.equal(runs[0].status,"won");
 assert.equal(runs[0].events.length,2);
}
async function main(){
 testBasics();testScannerColors();testScannerDynamicRows();testPreferShorterSource();testFinishPurpleBeforeBlue();testHeartColorSamples();testStablePalette();await testJournal();
 const matrix=[{colors:3,seeds:12},{colors:4,seeds:20},{colors:8,seeds:10},{colors:10,seeds:6,start:11}];
 const summary=[];
 for(const item of matrix){
  const results=Array.from({length:item.seeds},(_,i)=>simulate((item.start||1)+i,item.colors,item.colors<=4?180:240));
  const wins=results.filter(r=>r.win).length;
  summary.push({colors:item.colors,wins,total:results.length,
   incomplete:results.filter(r=>!r.win).map(r=>r.stop||"move cap")});
  // These are regression thresholds, not promises for arbitrary hidden boards.
  if(item.colors===3)assert(wins===12);
  if(item.colors===4)assert(wins>=18);
  if(item.colors===8)assert(wins>=5);
 }
 console.log(JSON.stringify({status:"tested",summary},null,2));
 console.log("Note: high-color hidden layouts can still fail; never promise guaranteed wins.");
}
main().catch(e=>{console.error(e);process.exitCode=1});
