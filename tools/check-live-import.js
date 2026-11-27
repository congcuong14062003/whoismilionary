'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert'),{once}=require('events');
const dir=path.resolve(__dirname,'../question-bank'),file=path.join(dir,'build-cache/live-import-test.json');
const base=require('../question-bank/CAU_HOI_THE_GIOI_2000.json').questions,extra=require('../question-bank/CAU_HOI_BO_SUNG_500.json').questions;
const child=cp.spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'8097',HOST:'127.0.0.1',DATA_FILE:file,AUTO_START:'false'},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
const get=route=>fetch('http://127.0.0.1:8097'+route).then(r=>r.json());
const post=async(route,body,status=200)=>{const r=await fetch('http://127.0.0.1:8097'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;};
(async()=>{
 try{
  let ready=false;for(let i=0;i<40;i++){try{await get('/api/state');ready=true;break;}catch{}await new Promise(r=>setTimeout(r,100));}assert(ready,log);
  const first=await post('/api/admin/import',{questions:[...base,...base]});assert.equal(first.inserted,2000);assert.equal(first.skipped,2000);
  await post('/api/admin/settings',{duration:120,auto:true});await post('/api/admin/control',{action:'start'});
  await post('/api/admin/comment',{userId:'import-check-player',username:'Người xem thử',comment:'A'});
  const before=await get('/api/state'),players=await get('/api/admin/players');
  const result=await post('/api/admin/import',{questions:extra});assert.equal(result.inserted,500);assert.equal(result.skipped,0);
  const after=await get('/api/state');
  for(const key of ['status','phase','questionId','questionIndex','phaseEndsAt','round','answerCount','participantCount'])assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(await get('/api/admin/players'),players);
  const again=await post('/api/admin/import',{questions:extra});assert.equal(again.inserted,0);assert.equal(again.skipped,500);
  const count=(await get('/api/admin/questions')).length;
  await post('/api/admin/import',{questions:[{text:'Câu mới chưa được ghi vào ngân hàng nếu có lỗi?',options:['Một','Hai','Ba','Bốn'],answer:'A'},null]},400);
  assert.equal((await get('/api/admin/questions')).length,count);
  const rows=await get('/api/admin/questions'),byId=new Map(rows.map(q=>[q.id,q]));
  for(const q of [...base,...extra]){assert.deepEqual(byId.get(q.id).options,q.options);assert.equal(byId.get(q.id).answer,q.answer);}
  console.log('PASS: import >1 MB; 2000 + 500 questions; repeated import skipped; current question, timer, answers and players unchanged; invalid batch rolled back; Vietnamese intact.');
 }finally{child.kill();await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,1000))]);for(const p of [file,file+'.tmp'])if(fs.existsSync(p))fs.unlinkSync(p);}
})().catch(e=>{console.error(e);process.exitCode=1;});
