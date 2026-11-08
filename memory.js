/* Replayable-level memory: every piece retains its original tube and layer. */
(function(root){
"use strict";
const KEY="juice-level-memory-v1",storage=(()=>{try{return root.localStorage||localStorage}catch(e){return null}})();
const clone=x=>JSON.parse(JSON.stringify(x)),id=(i,j)=>i+":"+j;
const real=x=>x!==undefined&&x!==null&&x!==""&&x!=="?"&&x!=="X"&&x!=="×"&&x!=="_";
const identity=s=>s.map((t,i)=>t.map((_,j)=>id(i,j)));
let level=null;try{const v=storage?.getItem(KEY);if(v){const x=JSON.parse(v);if(x?.original&&x.positions&&x.learned)level=x}}catch(e){}
function save(){try{storage?.setItem(KEY,JSON.stringify(level))}catch(e){}}
function knownCount(){return level?Object.values(level.learned).filter(real).length:0}
function original(){return level?.original.map((t,i)=>t.map((v,j)=>real(level.learned[id(i,j)])?level.learned[id(i,j)]:v))}
function match(s){
 if(!level||s.length!==level.original.length||s.some((t,i)=>t.length!==level.original[i].length))return false;
 return s.every((t,i)=>t.every((x,j)=>{const a=level.original[i][j],b=level.learned[id(i,j)];
 return (!real(a)||a===x)&&(!real(x)||!real(b)||x===b)&&(a!=="?"||!real(x)||real(b))}))
}
function begin(s,forceNew=false){
 const reused=!forceNew&&match(s);
 if(!reused)level={original:clone(s),positions:identity(s),learned:{},moves:0,createdAt:new Date().toISOString()};
 else{level.positions=identity(level.original);level.moves=0}
 save();return {board:clone(original()),reused,learned:knownCount()}
}
function attach(s){
 if(!level||s.length!==level.positions.length)return false;
 const used=new Set();
 return s.every((t,i)=>t.length===level.positions[i].length&&t.every((v,j)=>{
  const token=level.positions[i][j];if(typeof token!=="string"||used.has(token))return false;used.add(token);
  const [a,b]=token.split(":").map(Number),original=level.original[a]?.[b];
  if(original===undefined)return false;
  const expected=real(level.learned[token])?level.learned[token]:original;
  return !real(expected)||v===expected;
 }))
}
function snapshot(){return clone(level)}
function restore(saved){
 const previous=level;level=clone(saved);
 if(!level||!Array.isArray(level.original)||!Array.isArray(level.positions)||!level.learned){level=previous;return false}
 save();return true
}
function edit(i,j,value,removed=false){
 if(!level||!level.positions[i])return false;
 if(removed)return false; // Structural correction requires a new consistent baseline
 const token=level.positions[i][j];if(!token)return false;
 const [ti,sj]=token.split(":").map(Number);
 if(level.original[ti][sj]==="?"||level.original[ti][sj]==="X"){if(real(value))level.learned[token]=String(value);else delete level.learned[token]}
 else if(value==="?"||value==="X"||real(value))level.original[ti][sj]=String(value);
 save();return true
}
function move(m){
 if(!level)return false;
 const [i,j,k]=m;if(!level.positions[i]||!level.positions[j]||k<1||level.positions[i].length<k)throw Error("Неправильное перемещение");
 for(let n=0;n<k;n++)level.positions[j].push(level.positions[i].pop());
 level.moves++;save();return true
}
function decorate(s){return !level?clone(s):s.map((t,i)=>t.map((v,j)=>v==="?"&&real(level.learned[level.positions[i]?.[j]])?level.learned[level.positions[i][j]]:v))}
function restart(){if(!level)return null;level.positions=identity(level.original);level.moves=0;save();return clone(original())}
const hasLevel=()=>!!level&&level.original.some(t=>t.length);
const info=()=>level?{known:knownCount(),moves:level.moves,tubes:level.original.length}:null;
root.JuiceMemory={begin,attach,edit,move,decorate,restart,knownCount,hasLevel,info,snapshot,restore};
})(typeof window!=="undefined"?window:globalThis);
