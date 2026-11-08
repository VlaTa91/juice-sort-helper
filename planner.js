/* Belief-state Monte Carlo planner: hidden colors sampled only for possible
   observations. All actions are chosen from currently visible state. */
(function(g){
"use strict";
function copy(s){return s.map(t=>t.slice())}
function key(s){return s.map(t=>t.join(",")).join("|")}
function unknown(s){let n=0;for(const t of s)for(const v of t)if(v==="?")n++;return n}
function solved(s,cap){const colors=new Set();for(const t of s){if(!t.length)continue;if(t.length!==cap||t.some(x=>x==="?"||x!==t[0])||colors.has(t[0]))return false;colors.add(t[0])}return true}
function legal(s,cap){const out=[];let firstEmpty=-1;
for(let i=0;i<s.length;i++){const a=s[i];if(!a.length||a.at(-1)==="?")continue;
let run=1;while(run<a.length&&a[a.length-1-run]===a.at(-1))run++;
if(a.length===cap&&run===cap)continue;
for(let j=0;j<s.length;j++){if(i===j)continue;const b=s[j];if(b.length>=cap)continue;if(b.length&&b.at(-1)!==a.at(-1))continue;
if(!b.length){if(firstEmpty===-1)firstEmpty=j;if(j!==firstEmpty)continue;}
const amt=Math.min(run,cap-b.length);if(amt>0)out.push([i,j,amt]);
}}return out}
function move(s,m){const t=copy(s),[a,b,n]=m;for(let k=0;k<n;k++)t[b].push(t[a].pop());return t}
// When reciprocal pours reveal equally unknown layers, moving from the
// shorter tube into the longer one reduces stranded pieces and frees space
// earlier. Keep the alternative when it provides different information.
function preferCompactMoves(s,moves){
 return moves.filter(m=>{
  const [i,j,n]=m,a=s[i],b=s[j];
  if(!a.length||!b.length||a.length<=b.length||a.at(-1)!==b.at(-1))return true;
  const reverse=moves.some(r=>r[0]===j&&r[1]===i&&r[2]===n);
  if(!reverse)return true;
  const exposedA=a.length>n?a[a.length-n-1]:null;
  const exposedB=b.length>n?b[b.length-n-1]:null;
  // Avoid pruning a move with better information or a different block depth.
  return exposedA!==exposedB||exposedA!=="?";
 });
}

function rngSeed(seed){let v=(seed>>>0)||1;return()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return (v>>>0)/4294967296}}
function seedOf(s){let h=2166136261;for(const c of key(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function deck(s,cap,palette){const filled=s.reduce((n,t)=>n+t.length,0),hidden=unknown(s),nColors=filled/cap;
const counts=new Map();for(const t of s)for(const c of t)if(c!=="?")counts.set(c,(counts.get(c)||0)+1);
if(!Number.isInteger(nColors)||nColors<1||counts.size>nColors||[...counts.values()].some(n=>n>cap))return null;
const types=[...counts.keys()];
for(const c of palette||[]){if(types.length>=nColors)break;if(!types.includes(String(c)))types.push(String(c))}
let ix=0;while(types.length<nColors){const c="unseen"+ix++;if(!types.includes(c))types.push(c)}
const remaining=new Map(types.map(c=>[c,cap-(counts.get(c)||0)])),bag=[];
for(const [c,n]of remaining)for(let j=0;j<n;j++)bag.push(c);
if(bag.length!==hidden)return null;
return {types,remaining:Object.fromEntries(remaining),unknown:hidden,filled,nColors,bag}}
// A completed tube containing all four known pieces of one color is
// irreversible progress. Do this before stochastic scoring, which otherwise
// may prefer to fill an unrelated partially mixed tube.
function guaranteedCompletion(s,m,cap){
 const [i,j,n]=m,from=s[i],to=s[j],color=from.at(-1);
 if(!to.length||!to.every(v=>v===color)||to.length+n!==cap)return false;
 return s.reduce((count,t)=>count+t.filter(v=>v===color).length,0)===cap;
}
function sample(s,bag,rng){const b=bag.slice();for(let i=b.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[b[i],b[j]]=[b[j],b[i]]}let k=0;return s.map(t=>t.map(x=>x==="?"?b[k++]:x))}
function after(obs,world,m){const nw=move(world,m),no=move(obs,m),i=m[0];let reveal=null;
if(no[i].at(-1)==="?"){reveal=nw[i].at(-1);no[i][no[i].length-1]=reveal}
return {obs:no,world:nw,reveal}}
function moveScore(s,m,cap){const [i,j,n]=m,a=s[i],b=s[j],v=a.at(-1);let score=0;
if(a.length>n&&a[a.length-n-1]==="?")score+=15;
// Prefer reducing a shorter partially solved tube when both stacks match.
if(b.length&&a.at(-1)===b.at(-1))score+=(b.length-a.length)*3;
if(b.length)score+=8+n*1.4;else score-=2;
if(b.length+n===cap&&b.length&&b.every(x=>x===v))score+=8;
if(a.length===n&&b.length)score+=7;
if(a.length===n&&!b.length)score-=18;
if(a.length===cap&&a.every(x=>x===v)&&!b.length)score-=40;
if(!b.length&&s.filter(t=>!t.length).length===1)score-=30;
return score}
function evaluate(obs,initialUnknown,cap,steps){if(solved(obs,cap))return 100-steps*.4;
const moves=legal(obs,cap);if(!moves.length)return -95;
let complete=0,runs=0;for(const t of obs){if(t.length===cap&&t.every(x=>x===t[0]))complete++;
for(let i=0;i<t.length;i++)if(i===0||t[i]!==t[i-1])runs++}
const empties=obs.filter(t=>!t.length).length,diversity=new Set(moves.map(m=>m[0])).size;
return (initialUnknown-unknown(obs))*4.7+complete*9+empties*2.2+Math.min(6,diversity)*1.1-runs*.3-steps*.32}
function rollout(obs,world,rng,depth,maxDepth,initialUnknown,cap){
const seen=new Set([key(obs)]);let turn=depth;
while(turn<maxDepth){if(solved(obs,cap))break;
const moves=legal(obs,cap);if(!moves.length)break;
const choices=moves.map(m=>({m,v:moveScore(obs,m,cap)+rng()*9})).sort((a,b)=>b.v-a.v);
let best=null;for(const c of choices){if(!seen.has(key(move(obs,c.m)))){best=c;break}}
if(!best)break;
const step=after(obs,world,best.m);obs=step.obs;world=step.world;seen.add(key(obs));turn++;
}return evaluate(obs,initialUnknown,cap,turn)}
function choose(s,options={}){
const cap=options.capacity||4;
const visited=new Set((options.visited||[]).map(v=>{
try{return typeof v==="string"&&v.startsWith("[")?key(JSON.parse(v)):v}catch(e){return v}}));
const allMoves=legal(s,cap);
const fresh=allMoves.filter(m=>!visited.has(key(move(s,m))));
const compact=preferCompactMoves(s,fresh);
const spare=s.filter(t=>!t.length).length,merges=compact.filter(m=>s[m[1]].length>0);
const available=spare===1&&merges.length?merges:compact;
if(!available.length)return {move:null,reason:"no-legal"};
const distribution=deck(s,cap,options.palette||[]);
if(!distribution)return {move:null,reason:"invalid-counts"};
const completed=available.filter(m=>guaranteedCompletion(s,m,cap));
if(completed.length){
 completed.sort((a,b)=>{
  const reveal=m=>s[m[0]].length>m[2]&&s[m[0]][s[m[0]].length-m[2]-1]==="?";
  return Number(reveal(b))-Number(reveal(a));
 });
 return {move:completed[0],reason:"guaranteed-completion",distribution,simulations:0};
}
if(!distribution.unknown){const sorted=available.map(m=>({m,score:moveScore(s,m,cap)})).sort((a,b)=>b.score-a.score);
return {move:sorted[0].m,reason:"visible-only",distribution,simulations:0}}
const maxDepth=Math.max(6,Math.min(34,options.depth||22));
const simulations=Math.max(40,Math.min(2000,options.simulations||340));
const rng=rngSeed(options.seed??seedOf(s)),nodes=new Map(),rootKey=key(s),discount=.998;
function getNode(obs){const k=key(obs);let node=nodes.get(k);
if(!node){node={visits:0,actions:legal(obs,cap).map(m=>({m,n:0,q:0,dead:0,win:0,reveals:0}))};nodes.set(k,node)}return node}
const root=getNode(s);root.actions=root.actions.filter(a=>available.some(m=>m.join()===a.m.join()));
for(let k=0;k<simulations;k++){
const world0=sample(s,distribution.bag,rng);
let obs=copy(s),world=world0,trail=[],seen=new Set([rootKey]),depth=0;
while(depth<maxDepth){if(solved(obs,cap))break;
const node=getNode(obs);if(!node.actions.length)break;
let action=null;
const untried=node.actions.filter(a=>a.n===0);
if(untried.length){untried.sort((a,b)=>moveScore(obs,b.m,cap)-moveScore(obs,a.m,cap));
action=untried[Math.floor(Math.pow(rng(),2)*Math.min(untried.length,3))]}
else{let best=-Infinity;for(const a of node.actions){
const optimism=a.q/a.n+48*Math.sqrt(Math.log(1+node.visits)/a.n)+moveScore(obs,a.m,cap)*.35;
if(optimism>best){best=optimism;action=a}}}
const step=after(obs,world,action.m);
trail.push({node,action,revealed:step.reveal!==null});
obs=step.obs;world=step.world;depth++;
const stateKey=key(obs);if(seen.has(stateKey))break;seen.add(stateKey);
if(action.n===0)break;
}
let reward=rollout(obs,world,rng,depth,maxDepth,distribution.unknown,cap);
if(depth<maxDepth&&solved(obs,cap))reward=100-depth*.4;
for(const e of trail){e.node.visits++;e.action.n++;e.action.q+=reward*Math.pow(discount,depth);
if(reward<=-90)e.action.dead++;if(reward>=80)e.action.win++;if(e.revealed)e.action.reveals++}
}
const ranked=root.actions.filter(a=>a.n>0).map(a=>({move:a.m,visits:a.n,value:a.q/a.n,
deadRate:a.dead/a.n,winRate:a.win/a.n,immediateRevealRate:a.reveals/a.n}))
.sort((a,b)=>(b.value-80*b.deadRate)-(a.value-80*a.deadRate));
return {move:ranked[0]?.move||null,reason:"belief-mcts",distribution:{
types:distribution.types,remaining:distribution.remaining,unknown:distribution.unknown,nColors:distribution.nColors},
simulations,candidates:ranked,nodes:nodes.size}
}
g.JuicePlanner={choose,legal,move,after,deck,sample,solved,rngSeed,preferCompactMoves,guaranteedCompletion};
})(typeof window!=="undefined"?window:globalThis);
