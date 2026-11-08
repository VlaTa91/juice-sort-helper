/* Run with Node 22: node "tests/memory tests.js" */
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const script=fs.readFileSync(path.join(root,"memory.js"),"utf8");
function device(store){
 const ctx={localStorage:{
  getItem:k=>store.get(k)||null,
  setItem:(k,v)=>store.set(k,v)
 }};ctx.window=ctx;vm.runInNewContext(script,ctx);return ctx.JuiceMemory
}
const store=new Map(),M=device(store);
const initial=[["?","?","?","1"],["?","?","?","2"],[],[]];
const stringify=v=>JSON.stringify(v);
assert.equal(M.begin(initial,true).reused,false);
assert.equal(M.knownCount(),0);

// First attempt: move the first visible pieces, uncover originals 0:2 and 1:2.
M.move([0,2,1]);M.edit(0,2,"3");
M.move([1,2,1]);M.edit(1,2,"4");
assert.equal(M.knownCount(),2);
assert.equal(M.info().moves,2);
const known=M.restart();
assert.equal(known[0][2],"3");assert.equal(known[1][2],"4");
assert.equal(known[0][3],"1");assert.equal(known[1][3],"2");
assert.equal(M.info().moves,0);

// In the next run, previously revealed pieces are recognised without new input.
M.move([0,2,1]);M.move([0,3,1]);
let board=[["?","?","1"],["?","4","?","2"],["1"],["?"]];
assert.equal(M.decorate(board)[3][0],"3");
M.edit(1,2,"5"); // Explicit correction: original token 1:2, not slot from current tube.
assert.equal(M.restart()[1][2],"5");
assert.equal(M.knownCount(),2);

// Restart retains the discoveries after closing/reopening the installed PWA.
const M2=device(store);
assert.equal(M2.attach(M2.restart()),true);
assert.equal(M2.knownCount(),2);
assert.equal(M2.begin(initial).reused,true);
assert.equal(M2.restart()[0][2],"3");
assert.equal(M2.restart()[1][2],"5");

// A fresh screenshot of the SAME level can show already-opened pieces.
const replayScreenshot=[["?","?","3","1"],["?","?","5","2"],[],[]];
assert.equal(M2.begin(replayScreenshot).reused,true);
assert.equal(M2.knownCount(),2);

// A DIFFERENT level must not inherit the previous level's discoveries.
assert.equal(M2.begin([["?","?","?","8"],["?","?","?","2"],[],[]]).reused,false);
assert.equal(M2.knownCount(),0);
assert.equal(M2.restart()[0][2],"?");

// Multiple same-color pieces preserve origin identifiers and order.
const mult=[["?","2","2","2"],["1","1"],[],[]];
M2.begin(mult,true);M2.move([0,2,2]);M2.edit(0,1,"3");
assert.equal(M2.restart()[0][1],"3");
// A simulated move can be rewound without confusing token IDs.
M2.begin([["?","?","2"],["?","2"],[]],true);
const beforeMove=M2.snapshot();
M2.move([0,1,1]);
M2.edit(0,1,"3"); // learned from the moved source
assert.equal(M2.knownCount(),1);
assert.equal(M2.restore(beforeMove,{retainDiscoveries:true}),true);
assert.equal(M2.info().moves,0);
assert.equal(M2.restart()[0][1],"3","Genuine discoveries survive rewinding a move");
M2.begin([["?","?","2"],["?","2"],[]],true);
const beforeCorrection=M2.snapshot();
M2.edit(0,1,"3");
assert.equal(M2.restore(beforeCorrection),true);
assert.equal(M2.knownCount(),0,"Undoing an edit must reverse a mistaken color");
// Manual repair after a missed or extra tube must preserve original tokens.
const repair=device(new Map());
repair.begin([["?","?","?","1"],["?","?","?","2"],[],[]],true);
repair.move([0,2,1]);repair.edit(0,2,"3");
assert.equal(repair.knownCount(),1);
const beforeInsert=repair.snapshot();
assert.equal(repair.insertTube(1,["?","?","?","?"]),true);
assert.equal(repair.info().tubes,5);
assert.equal(repair.edit(1,3,"8"),true);
assert.equal(repair.restart()[1][3],"8");
assert.equal(repair.restart()[0][2],"3","Adding tube cannot erase an earlier discovery");
assert.equal(repair.restart()[2][3],"2","Original tube following insertion moves to new index");
assert.equal(repair.removeTube(1),true,"Repair tube can be removed before pours");
assert.equal(repair.info().tubes,4);
assert.equal(repair.restart()[0][2],"3","Removing extra tube must retain known layers");
assert.equal(repair.restore(beforeInsert),true,"Undo structure change restores original topology");
assert.equal(repair.info().tubes,4);

// Fill an initially empty tube by choosing its bottom layer, then reset it.
repair.begin([["?","?","?","1"],["?","?","?","2"],[],[]],true);
assert.equal(repair.insertTube(2,[]),true);
assert.equal(repair.edit(2,0,"8"),true);
assert.equal(repair.restart()[2][0],"8","Manual painting empty bottom slot persists");
assert.equal(repair.edit(2,0,"?"),true);
assert.equal(repair.restart()[2][0],"?","Correcting a false color to ? clears knowledge");
assert.equal(repair.edit(2,0,"×",true),true);
assert.equal(repair.restart()[2].length,0,"Deleting the top manually added layer works");
assert.equal(repair.removeTube(2),true);
assert.equal(repair.info().tubes,4);
repair.begin([["?","?","?","1"],[],[]],true);
repair.move([0,1,1]);
assert.equal(repair.removeTube(0),false,"A tube with pieces moved elsewhere cannot be removed");
console.log("Level replay memory tests passed");
