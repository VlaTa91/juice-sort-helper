/* Run: node "tests/strategy tests.js"
   Regression of systematic move priorities from user-played levels. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"..","planner.js"),"utf8"),sandbox);
const P=sandbox.window.JuicePlanner;
const opening=[
 ["?","?","?","0"],["?","?","?","1"],["?","?","?","0"],
 ["?","?","?","2"],["?","?","?","0"],["?","?","?","3"],[],[]
];
const first=P.choose(opening,{simulations:50,seed:2});
assert.equal(first.reason,"systematic-opening");
assert.equal(first.move.join(","),"0,6,1","Choose first tube of most frequent top color");
const example=[
 ["?","?","?","7"],["?","?","?","5"],["?","?","?","6"],["?","?","?","9"],
 ["?","?","2"],["?","?","1"],["?","2"],["?","1","1"],["?"],[]
];
const ms=P.legal(example,4);
const orange=ms.find(m=>m[0]===4&&m[1]===6);
const blue=ms.find(m=>m[0]===5&&m[1]===7);
assert(orange&&blue,"Both matching moves should be legal");
assert(P.strategicValue(example,blue,4)>P.strategicValue(example,orange,4),
 "At comparable reveal depth, prefer a group of three over a group of two");
assert.equal(example.filter(t=>!t.length).length,1);
assert(ms.some(m=>m[1]===9),"The last free tube must remain an eligible move");
const entirelyKnown=[["1","1","1"],["1"],["2","2","2","2"],[]];
const completion=P.choose(entirelyKnown,{capacity:4});
assert.equal(completion.reason,"guaranteed-completion");
assert.equal(completion.move.join(","),"1,0,1");
console.log("Systematic strategy regression tests passed");
