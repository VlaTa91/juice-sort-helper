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
// Later-stage exploration: when merges have already been tried, exposing
// the bottom hidden layer in tube 7 is preferable to opening another tall tube.
const shallow=[
 ["?","?","?","2"],["?","?","?","10"],["?","?","?","10"],
 ["?","?","?","1"],["?","?","?","6"],["?","?","5"],
 ["?","8"],["?","?","0","0"],["9","9","9"],[]
];
const exploratory=P.legal(shallow,4).filter(m=>!shallow[m[1]].length);
assert.equal(P.systematicOpening(shallow,exploratory).join(","),"6,9,1",
 "Reveal last hidden layer in tube 7 before opening another tall source");
const entirelyKnown=[["1","1","1"],["1"],["2","2","2","2"],[]];
const completion=P.choose(entirelyKnown,{capacity:4});
assert.equal(completion.reason,"guaranteed-completion");
assert.equal(completion.move.join(","),"0,1,3","Finish a full color by moving three pieces into one");
// Level example: tube 7 and tube 8 both contain one visible gray dash
// above three unknowns, tube 9 has a gray dash at the bottom.
const grayTubes=[
 ["?","?","?","2"],["?","?","?","10"],["?","?","?","10"],
 ["?","?","?","1"],["?","?","?","6"],["?","?","5"],
 ["?","?","?","9"],["?","?","?","9"],["9"],[]
];
const grayMoves=P.legal(grayTubes,4);
assert(grayMoves.some(m=>m.join()==="6,8,1"));
assert(grayMoves.some(m=>m.join()==="7,8,1"));
const grayPreferred=P.preferLowerSource(grayTubes,grayMoves);
assert(grayPreferred.some(m=>m.join()==="6,8,1"),
 "Tube 7 -> 9 should survive among equivalent gray pours");
assert(!grayPreferred.some(m=>m.join()==="7,8,1"),
 "Tube 8 -> 9 must not compete with an equivalent lower source");

// Same-height reciprocal pours: in a tie use tube 7 -> 8, never 8 -> 7.
const dropletTubes=grayTubes.map(t=>t.slice());
dropletTubes[6]=["?","?","0"];
dropletTubes[7]=["?","?","0"];
dropletTubes[8]=["9","9","9"];
const reciprocal=P.legal(dropletTubes,4);
assert(reciprocal.some(m=>m.join()==="6,7,1"));
assert(reciprocal.some(m=>m.join()==="7,6,1"));
const pairPreferred=P.preferLowerSource(dropletTubes,reciprocal);
assert(pairPreferred.some(m=>m.join()==="6,7,1"),
 "Choose tube 7 -> 8 for symmetric reciprocal pours");
assert(!pairPreferred.some(m=>m.join()==="7,6,1"),
 "Never prefer 8 -> 7 when 7 -> 8 is structurally identical");

// Do not hide a real choice: a known buried color changes the continuation.
const differentLayers=dropletTubes.map(t=>t.slice());
differentLayers[6][1]="4";
const distinct=P.preferLowerSource(differentLayers,P.legal(differentLayers,4));
assert(distinct.some(m=>m.join()==="6,7,1"));
assert(distinct.some(m=>m.join()==="7,6,1"),
 "Both directions remain when their newly exposed information differs");
console.log("Systematic strategy regression tests passed");
