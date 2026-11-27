'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert'),{once}=require('events');
const dir=path.resolve(__dirname,'../question-bank'),dataFile=path.join(dir,'build-cache/import-test-state.json');
const bank=JSON.parse(fs.readFileSync(path.join(dir,'CAU_HOI_THE_GIOI_2000.json'),'utf8')).questions;
const child=cp.spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'8097',HOST:'127.0.0.1',DATA_FILE:dataFile,AUTO_START:'false'},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
(async()=>{
 try{
  let ready=false;for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:8097/api/state');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert(ready,logs||'Server not ready');
  const payload=JSON.stringify({questions:bank});assert(Buffer.byteLength(payload)<1048576);
  const response=await fetch('http://127.0.0.1:8097/api/admin/import',{method:'POST',headers:{'Content-Type':'application/json'},body:payload});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.inserted,2000);
  const rows=await fetch('http://127.0.0.1:8097/api/admin/questions').then(r=>r.json());
  const byId=new Map(rows.map(q=>[q.id,q]));for(const q of bank){const actual=byId.get(q.id);assert(actual);assert.deepEqual(actual.options,q.options);assert.equal(actual.answer,q.answer);assert(actual.approved);}
  console.log('PASS: imported 2000; total '+rows.length+'; all options and answers preserved; payload '+Buffer.byteLength(payload)+' bytes.');
 }finally{child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,1000))]);for(const p of [dataFile,dataFile+'.tmp'])if(fs.existsSync(p))fs.unlinkSync(p);}
})().catch(e=>{console.error(e);process.exitCode=1;});
