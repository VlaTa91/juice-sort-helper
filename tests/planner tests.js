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
 testBasics();testScannerColors();await testJournal();
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
