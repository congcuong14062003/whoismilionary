'use strict';
const assert=require('assert'),http=require('http'),{once}=require('events');
const {CloudStore,RedisRest,RELEASE,COMMIT,LEASE}=require('./cloud/store');
const {CloudLiveWorker}=require('./cloud/live-worker');
const {createHandler,pathOf}=require('./cloud/handler');
class MemoryRedis{
 constructor(){this.values=new Map();}
 get(key){const x=this.values.get(key);if(x&&x.until&&x.until<=Date.now()){this.values.delete(key);return null;}return x?.value??null;}
 async command(a){
  const [cmd,key,value,...rest]=a;
  if(cmd==='GET')return this.get(key);
  if(cmd==='SET'){if(rest.includes('NX')&&this.get(key)!==null)return null;const i=rest.indexOf('PX');this.values.set(key,{value,until:i<0?0:Date.now()+Number(rest[i+1])});return 'OK';}
  if(cmd==='DEL')return this.values.delete(key)?1:0;
  if(cmd==='EXPIRE'){const x=this.values.get(key);if(x)x.until=Date.now()+Number(value)*1000;return x?1:0;}
  if(cmd==='EVAL'){
   const script=key,n=Number(value),keys=a.slice(3,3+n),args=a.slice(3+n);
   if(script===RELEASE){if(this.get(keys[0])!==args[0])return 0;return this.values.delete(keys[0])?1:0;}
   if(script===LEASE){if(this.get(keys[0])!==null&&this.get(keys[0])!==args[0])return 0;this.values.set(keys[0],{value:args[0],until:Date.now()+Number(args[1])});return 1;}
   if(script===COMMIT){if(this.get(keys[0])!==args[0]||(args[2]&&this.get(keys[2])!==args[2]))return 0;this.values.set(keys[1],{value:args[1],until:0});this.values.delete(keys[0]);return 1;}
  }throw Error('Unsupported Redis command '+cmd);
 }
}
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;};
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
(async()=>{
 const memory=new MemoryRedis();
 const rest=http.createServer(async(req,res)=>{try{assert.equal(req.headers.authorization,'Bearer test-token');let b='';for await(const c of req)b+=c;const result=await memory.command(JSON.parse(b));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result}));}catch(e){res.statusCode=400;res.end(JSON.stringify({error:e.message}));}});
 const endpoint=await listen(rest),env={UPSTASH_REDIS_REST_URL:endpoint,UPSTASH_REDIS_REST_TOKEN:'test-token'};
 const makeStore=()=>new CloudStore(new RedisRest(env),'cloud-test');
 const storeA=makeStore(),storeB=makeStore();
 const workerA=new CloudLiveWorker(storeA),workerB=new CloudLiveWorker(storeB);
 const a=http.createServer(createHandler({store:storeA,worker:workerA,streamMilliseconds:100,pollMilliseconds:20}));
 const b=http.createServer(createHandler({store:storeB,worker:workerB,streamMilliseconds:100,pollMilliseconds:20}));
 const aa=await listen(a),bb=await listen(b);
 const get=(base,p)=>fetch(base+p).then(r=>r.json());
 const post=async(base,p,body,status=200)=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result;};
 try{
  assert.equal(pathOf({url:'/api/index?quiz_path=admin%2Fcontrol'}),'/api/admin/control');
  assert.equal((await get(aa,'/api/state')).status,'idle');
  await post(aa,'/api/admin/settings',{duration:120,auto:false});
  const started=await post(aa,'/api/admin/control',{action:'start'});
  const other=await get(bb,'/api/state');assert.equal(other.questionId,started.questionId);assert.equal(other.settings.duration,120);assert.equal(other.status,'running');
  const correct=await get(bb,'/api/admin/current-answer');
  const answers=await Promise.all([post(aa,'/api/admin/comment',{userId:'viewer',username:'Khán giả',comment:correct.answer}),post(bb,'/api/admin/comment',{userId:'viewer',username:'Khán giả',comment:correct.answer})]);
  assert.equal(answers.filter(x=>x.accepted).length,1);
  await post(bb,'/api/admin/control',{action:'lock'});await post(aa,'/api/admin/control',{action:'reveal'});
  const scored=await get(bb,'/api/state');assert(scored.leaderboard[0].points>0);
  assert.equal((await makeStore().read()).snapshot.leaderboard[0].points,scored.leaderboard[0].points);
  await storeA.mutate(ctx=>{ctx.game.state.phaseEndsAt=Date.now()-1;ctx.game.changed();});
  assert.equal((await get(bb,'/api/state')).phase,'intermission');
  const extra=require('./question-bank/CAU_HOI_BO_SUNG_500.json').questions;
  const imported=await post(aa,'/api/admin/import',{questions:extra});assert.equal(imported.inserted,500);assert.equal(imported.total,600);
  assert.equal((await makeStore().read()).snapshot.questionCount,600);
  assert.equal((await post(bb,'/api/admin/import',{questions:extra})).skipped,500);
  const rows=await get(bb,'/api/admin/questions');for(const q of extra){const found=rows.find(x=>x.id===q.id);assert.deepEqual(found.options,q.options);assert.equal(found.answer,q.answer);}
  await post(aa,'/api/admin/import',{questions:[{text:'Câu mới sẽ không được lưu nếu lô nhập có lỗi?',options:['A1','B1','C1','D1'],answer:'A'},null]},400);assert.equal((await get(bb,'/api/admin/questions')).length,600);
  assert((await fetch(aa+'/api/events').then(r=>r.text())).includes('data: '));
  assert.deepEqual(await get(bb,'/api/health'),{ok:true,platform:'vercel',storage:'redis'});
  const blank=new RedisRest({});await assert.rejects(()=>blank.command(['GET','x']),/Chưa kết nối Redis/);
  const captured=[];class FakeAdapter{constructor(emit,status){this.emit=emit;this.status=status;captured.push(this);}start(username){this.username=username;this.status({mode:'direct',status:'Đã kết nối LIVE',username,connected:true});}stop(){this.stopped=true;}}
  const wa=new CloudLiveWorker(storeA,FakeAdapter),wb=new CloudLiveWorker(storeB,FakeAdapter);
  await post(aa,'/api/admin/control',{action:'next'});await post(aa,'/api/admin/live-connect',{username:'@ten_kenh'});
  wa.retain();wb.retain();await Promise.all([wa.sync('ten_kenh'),wb.sync('ten_kenh')]);assert.equal(captured.length,1);
  for(let i=0;i<40;i++){if((await storeA.read()).snapshot.connection.connected)break;await new Promise(r=>setTimeout(r,20));}
  assert((await storeB.read()).snapshot.connection.connected);
  await captured[0].emit({userId:'live-viewer',nickname:'Người xem thật',comment:'A',eventId:'live-e1',timestamp:Date.now()});
  assert.equal((await storeB.read()).snapshot.connection.received,1);
  const owner=wa.actor?wa:wb,successor=wa.actor?wb:wa;
  await memory.command(['DEL',storeA.key('worker')]);successor.nextLeaseCheck=0;await successor.sync('ten_kenh');assert.equal(captured.length,2);
  await captured[0].emit({userId:'stale-worker-viewer',comment:'B',eventId:'stale-e2',timestamp:Date.now()});
  assert(!(await get(bb,'/api/admin/players')).some(x=>x.id==='stale-worker-viewer'));
  await owner.release();await successor.release();
  console.log('PASS cloud: cross-instance start/settings, simultaneous answers scored once, durable score/bank, clock catch-up, 500-question import/dedup/rollback, SSE reconnect boundary, missing Redis error, single TikTok lease and stale-worker fencing.');
 }finally{await close(a);await close(b);await close(rest);}
})().catch(e=>{console.error(e);process.exitCode=1;});
