/* Append-only attempt history. Offline IndexedDB + local active-run recovery. */
(function(g){
"use strict";
const DB="Juice sort history",STORE="attempts",ACTIVE="juice-active-attempt-v1";
let active=null,openPromise=null;
function clone(v){return JSON.parse(JSON.stringify(v))}
function id(){return String(Date.now())+"-"+Math.floor(Math.random()*1e9).toString(36)}
try{const raw=localStorage.getItem(ACTIVE);if(raw)active=JSON.parse(raw)}catch(e){}
function db(){if(openPromise)return openPromise;openPromise=new Promise(resolve=>{
if(!("indexedDB" in g)){resolve(null);return}
try{const req=indexedDB.open(DB,1);
req.onupgradeneeded=()=>{const database=req.result;if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:"id"})};
req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null)}catch(e){resolve(null)}});return openPromise}
function persist(){
if(!active)return;
try{localStorage.setItem(ACTIVE,JSON.stringify(active))}catch(e){}
const snapshot=clone(active);
db().then(database=>{if(!database)return;try{
const tx=database.transaction(STORE,"readwrite");
tx.objectStore(STORE).put(snapshot)}catch(e){}})
}
function start(board,meta={}){
if(active&&active.status==="in-progress"){active.status="replaced";active.finishedAt=new Date().toISOString();persist()}
active={id:id(),startedAt:new Date().toISOString(),status:"in-progress",
initial:clone(board),latest:clone(board),meta:clone(meta),events:[]};persist();return active.id}
function resume(board){if(!active||active.status!=="in-progress"){start(board,{source:"recovered"});return}
if(JSON.stringify(active.latest)!==JSON.stringify(board)){
active.events.push({at:new Date().toISOString(),kind:"recovery",board:clone(board)});
active.latest=clone(board);persist()
}}
function record(kind,data,board){if(!active||active.status!=="in-progress")start(board||[],{source:"manual"});
const event={at:new Date().toISOString(),kind,data:clone(data||{})};
if(board!==undefined){event.board=clone(board);active.latest=clone(board)}
active.events.push(event);persist()}
function finish(status,board){if(!active||active.status!=="in-progress")return;
active.status=status;active.finishedAt=new Date().toISOString();active.latest=clone(board);persist()}
async function all(){const database=await db();if(!database)return active?[clone(active)]:[];
return new Promise(resolve=>{try{const tx=database.transaction(STORE,"readonly"),
req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(active?[clone(active)]:[])}
catch(e){resolve(active?[clone(active)]:[])}})}
async function exportJson(){const records=await all();if(!records.length)return false;
const blob=new Blob([JSON.stringify({schema:1,exportedAt:new Date().toISOString(),attempts:records},null,2)],{type:"application/json"});
const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;
link.download="История переливаний.json";document.body.appendChild(link);link.click();link.remove();
setTimeout(()=>URL.revokeObjectURL(url),1000);return true}
g.JuiceJournal={start,resume,record,finish,all,exportJson};
})(typeof window!=="undefined"?window:globalThis);
