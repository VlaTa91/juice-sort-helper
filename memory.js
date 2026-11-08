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
 return !!level&&s.length===level.positions.length&&s.every((t,i)=>t.length===level.positions[i].length&&t.every((v,j)=>!real(level.learned[level.positions[i][j]])||v===level.learned[level.positions[i][j]]))
}
// Snapshots keep the identity and original position of every piece, not just colors.
function snapshot(){return level?clone(level):null}
function restore(saved,{retainDiscoveries=false}={}){
 if(!saved||!Array.isArray(saved.original)||!Array.isArray(saved.positions)||
    !saved.learned||saved.positions.length!==saved.original.length)return false;
 const restored=clone(saved);
 if(retainDiscoveries&&level&&JSON.stringify(restored.original)===JSON.stringify(level.original)){
  for(const [token,value] of Object.entries(level.learned||{}))
   if(real(value))restored.learned[token]=value;
 }
 level=restored;save();return true;
}
// Keep original piece identities when manually correcting the scanner.
function edit(i,j,value,removed=false){
 if(!level||!Array.isArray(level.positions[i])||!Number.isInteger(j)||j<0)return false;
 const positions=level.positions[i];
 if(removed){
  if(j!==positions.length-1||!positions.length)return false;
  const token=positions[j],[ti,sj]=token.split(":").map(Number);
  // Never silently erase a piece whose origin is elsewhere after a real pour.
  if(ti!==i||sj!==level.original[ti]?.length-1)return false;
  positions.pop();level.original[ti].pop();delete level.learned[token];save();return true;
 }
 if(!real(value)&&value!=="?")return false;
 if(j===positions.length){
  // Fill an empty cell from the bottom up. It becomes part of the initial
  // layout as well, so restart and memory remain consistent.
  const layer=level.original[i].length,token=id(i,layer);
  level.original[i].push("?");
  positions.push(token);
 }
 const token=positions[j];if(!token)return false;
 const [ti,sj]=token.split(":").map(Number);
 if(!level.original[ti]||sj>=level.original[ti].length)return false;
 if(value==="?"){
  level.original[ti][sj]="?";delete level.learned[token];
 }else if(level.original[ti][sj]==="?"){
  level.learned[token]=String(value);
 }else if(value!==level.original[ti][sj]){
  level.original[ti][sj]=String(value);delete level.learned[token];
 }
 save();return true;
}
// Inserting/removing an entire tube shifts original tube indexes but keeps
// every already-learned color attached to the same physical piece.
function changeTubeIndex(index,delta){
 const renumber=token=>{
  const [ti,sj]=token.split(":").map(Number);
  return id(ti>=index?ti+delta:ti,sj);
 };
 level.positions=level.positions.map(t=>t.map(renumber));
 level.learned=Object.fromEntries(Object.entries(level.learned).map(
  ([token,value])=>[renumber(token),value]));
}
function insertTube(index,tokens=[]){
 if(!level||!Number.isInteger(index)||index<0||index>level.positions.length||
    !Array.isArray(tokens)||tokens.length>8||
    tokens.some(v=>v!=="?"&&!real(v)))return false;
 changeTubeIndex(index,1);
 level.original.splice(index,0,clone(tokens));
 level.positions.splice(index,0,tokens.map((_,j)=>id(index,j)));
 save();return true;
}
function removeTube(index){
 if(!level||!Number.isInteger(index)||index<0||index>=level.positions.length||
    level.positions.length<=3)return false;
 // Do not discard pieces from this origin if any were poured elsewhere, nor
 // pieces of other origins that have been poured into this tube.
 const belongs=token=>Number(token.split(":")[0])===index;
 if(level.positions[index].some(token=>!belongs(token))||
    level.positions.some((t,i)=>i!==index&&t.some(belongs)))return false;
 level.positions.splice(index,1);level.original.splice(index,1);
 level.learned=Object.fromEntries(Object.entries(level.learned)
  .filter(([token])=>!belongs(token))
  .map(([token,value])=>{
   const [ti,sj]=token.split(":").map(Number);
   return [id(ti>index?ti-1:ti,sj),value];
  }));
 level.positions=level.positions.map(t=>t.map(token=>{
  const [ti,sj]=token.split(":").map(Number);
  return id(ti>index?ti-1:ti,sj);
 }));
 save();return true;
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
root.JuiceMemory={begin,attach,edit,move,decorate,restart,knownCount,hasLevel,info,snapshot,restore,insertTube,removeTube};
})(typeof window!=="undefined"?window:globalThis);
