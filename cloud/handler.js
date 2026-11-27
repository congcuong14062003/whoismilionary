'use strict';
const crypto=require('crypto');
const {cleanQuestion}=require('../game');
const {MockAdapter,WebhookAdapter,normalizeStreamerUsername}=require('../adapters');
const {CloudError}=require('./store');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req){
 if(req.body!==undefined){if(typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;return JSON.parse(String(req.body));}
 req.setEncoding('utf8');let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4*1024*1024)throw new CloudError('File quá lớn. Hãy chia thành các file dưới 4 MB.',413);}try{return text?JSON.parse(text):{};}catch{throw new CloudError('JSON không hợp lệ',400);}
}
function checkOrigin(req){if(!req.headers.origin)return;const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();try{if(new URL(req.headers.origin).host===host)return;}catch{}throw new CloudError('Nguồn yêu cầu không hợp lệ',403);}
function pathOf(req){const u=new URL(req.url,'http://quiz.local');const routed=req.query?.quiz_path??u.searchParams.get('quiz_path');return routed!==null&&routed!==undefined?'/api/'+(Array.isArray(routed)?routed.join('/'):String(routed)).replace(/^\/+/,''):u.pathname;}
function csv(rows){const escape=x=>'"'+String(x??'').replace(/"/g,'""')+'"';return '\ufeff'+[['id','text','A','B','C','D','answer','explanation','topic','difficulty','seconds','source','approved'],...rows.map(q=>[q.id,q.text,...q.options,q.answer,q.explanation,q.topic,q.difficulty,q.seconds,q.source,q.approved])].map(row=>row.map(escape).join(',')).join('\r\n');}
function settings(game,input){
 for(const key of ['duration','revealDuration','breakDuration','auto','showVotes','voice','volume','music','musicVolume'])if(Object.prototype.hasOwnProperty.call(input,key)){
  const n=Number(input[key]);if(['duration','revealDuration','breakDuration','volume','musicVolume'].includes(key)&&!Number.isFinite(n))throw new CloudError('Cấu hình thời gian/âm lượng không hợp lệ',400);
  game.settings[key]=key==='duration'?Math.max(5,Math.min(120,n||20)):key==='revealDuration'?Math.max(1,Math.min(30,n||6)):key==='breakDuration'?Math.max(0,Math.min(30,n)):['volume','musicVolume'].includes(key)?Math.max(0,Math.min(1,n)):!!input[key];
 }game.changed();return game.settings;
}
function mutateRoute(ctx,method,p,b,req){
 const game=ctx.game,now=Date.now();
 if(p==='/api/admin/settings'&&method==='POST')return settings(game,b);
 if(p==='/api/admin/control'&&method==='POST'){
  switch(b.action){
   case 'start':game.start(now);break;case 'pause':game.pause(now);break;case 'resume':game.resume(now);break;case 'stop':game.stop();break;case 'next':game.skip(now);break;case 'lock':game.lock(now);break;case 'reveal':game.reveal(now);break;
   case 'reset-scores':for(const player of Object.values(game.players)){player.points=0;player.streak=0;player.correctTimeMs=0;}game.changed();break;
   case 'new-season':game.season++;game.players={};game.history=[];game.round=0;game.votes={};game.answers={};game.recentCorrect=[];game.stop();break;
   default:throw new CloudError('Thao tác không hợp lệ',400);
  }return game.publicState();
 }
 if(p==='/api/admin/live-connect'&&method==='POST'){
  const username=normalizeStreamerUsername(b.username||game.settings.streamerUsername);game.settings.streamerUsername=username;ctx.desiredUsername=username;
  game.connection={mode:'direct',status:'Đang chờ kết nối LIVE',username,connected:false,lastEventAt:null,received:0,lastComment:null,deliveryLagMs:null};game.changed();return game.connection;
 }
 if(p==='/api/admin/live-disconnect'&&method==='POST'){ctx.desiredUsername='';game.connection={...game.connection,connected:false,status:'Đã ngắt kết nối LIVE'};game.changed();return game.connection;}
 if(p==='/api/admin/source'&&method==='POST'){
  const username=b.username?normalizeStreamerUsername(b.username):'';if(username!==game.settings.streamerUsername)ctx.desiredUsername='';game.settings.streamerUsername=username;
  if(!ctx.desiredUsername)game.connection={mode:username?'idle':'mock',status:username?'Chưa kết nối LIVE':'Mô phỏng',username,connected:false,lastEventAt:null};game.changed();return game.connection;
 }
 if(p==='/api/comment-webhook'&&method==='POST'){
  const expected=process.env.COMMENT_WEBHOOK_SECRET||'',provided=String(req.headers['x-webhook-secret']||'');
  if(!expected||provided.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))throw new CloudError('Webhook chưa cấu hình hoặc secret sai',401);
  if(ctx.desiredUsername)throw new CloudError('Đang dùng kết nối LIVE trực tiếp',409);
  const webhook=new WebhookAdapter(event=>game.comment(event),()=>game.settings.streamerUsername);const result=webhook.receive(b);
  game.connection={...game.connection,mode:'webhook',username:game.settings.streamerUsername,lastEventAt:now};game.changed();return result;
 }
 if(p==='/api/admin/comment'&&method==='POST')return game.comment({userId:b.userId||'manual-'+crypto.randomUUID(),username:b.username||'Khách thử',nickname:b.nickname||b.username||'Khách thử',comment:b.comment,eventId:crypto.randomUUID(),timestamp:now},now);
 if(p==='/api/admin/simulate'&&method==='POST')return new MockAdapter(event=>game.comment(event)).simulate(b.count);
 if(p==='/api/admin/lifeline'&&method==='POST'){game.lifeline(b.type);return game.publicState();}
 if(p==='/api/admin/import'&&method==='POST'){
  if(!Array.isArray(b.questions)||!b.questions.length)throw new CloudError('File cần có danh sách câu hỏi không rỗng',400);
  const key=text=>String(text||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
  const seen=new Set(game.questions.map(q=>key(q.text))),ids=new Set(game.questions.map(q=>q.id)),incoming=[];let skipped=0;
  for(let i=0;i<b.questions.length;i++){
   const item=b.questions[i];if(!item||typeof item!=='object')throw new CloudError('Câu '+(i+1)+': dữ liệu không hợp lệ',400);
   if(seen.has(key(item.text))){skipped++;continue;}
   let q;try{q=cleanQuestion({...item,approved:item.approved!==false},[]);}catch(e){throw new CloudError('Câu '+(i+1)+': '+e.message,400);}
   if(ids.has(q.id))q.id=crypto.randomUUID();ids.add(q.id);seen.add(key(q.text));incoming.push(q);
  }
  game.questions.push(...incoming);if(incoming.length){ctx.bankDirty=true;game.changed();}
  return {inserted:incoming.length,skipped,total:game.questions.length,approved:game.questions.filter(q=>q.approved).length};
 }
 if(p==='/api/admin/questions'&&method==='POST'){const q=cleanQuestion(b,game.questions);if(game.questions.some(x=>x.id===q.id))q.id=crypto.randomUUID();game.questions.push(q);ctx.bankDirty=true;game.changed();return q;}
 if(p.startsWith('/api/admin/questions/')&&['PUT','DELETE'].includes(method)){
  const id=decodeURIComponent(p.slice('/api/admin/questions/'.length)),i=game.questions.findIndex(q=>q.id===id);if(i<0)throw new CloudError('Không tìm thấy câu hỏi',404);
  if(id===game.state.questionId&&game.state.status!=='idle')throw new CloudError('Câu đang phát chỉ có thể sửa hoặc xóa sau khi kết thúc ván.',409);
  if(method==='PUT')game.questions[i]=cleanQuestion({...game.questions[i],...b,id},game.questions);else game.questions.splice(i,1);
  ctx.bankDirty=true;game.changed();return method==='PUT'?game.questions[i]:{ok:true};
 }
 throw new CloudError('Không tìm thấy API',404);
}
function createHandler({store,worker,streamMilliseconds=235000,pollMilliseconds=1000}){
 async function stream(req,res){
  let closed=false;res.on('close',()=>closed=true);const initial=await store.read();
  res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders?.();res.write('retry: 1000\n\n');
  let lastRevision=null,deadline=Date.now()+streamMilliseconds;worker.retain();
  try{let current=initial;while(!closed&&Date.now()<deadline){
   await worker.sync(current.desiredUsername);
   const s=current.snapshot;if(lastRevision!==s.revision){res.write('data: '+JSON.stringify(s)+'\n\n');lastRevision=s.revision;}else res.write(': heartbeat\n\n');
   await sleep(pollMilliseconds);if(!closed)current=await store.read();
  }}catch(e){if(!closed)res.write('event: cloud-error\ndata: '+JSON.stringify({error:e.message})+'\n\n');}
  finally{await worker.release();if(!closed)res.end();}
 }
 return async(req,res)=>{
  try{
   const p=pathOf(req),method=req.method;
   if(method==='GET'&&p==='/api/events')return await stream(req,res);
   if(method==='GET'&&p==='/api/network')return json(res,200,{lanIp:null,platform:'vercel'});
   if(method==='GET'&&p==='/api/state')return json(res,200,(await store.read()).snapshot);
   if(method==='GET'&&p==='/api/leaderboard')return json(res,200,(await store.read()).snapshot.leaderboard);
   if(method==='GET'&&p==='/api/health'){await store.read();return json(res,200,{ok:true,platform:'vercel',storage:'redis'});}
   if(method==='GET'&&p.startsWith('/api/admin/')){
    const {game}=await store.context(await store.redis.command(['GET',store.key('state')]));
    const data=p==='/api/admin/questions'||p==='/api/admin/export.json'?game.questions:p==='/api/admin/players'?Object.values(game.players):p==='/api/admin/history'?game.history.slice(-100):p==='/api/admin/current-answer'?{questionId:game.state.questionId,answer:game.current()?.answer||null}:null;
    if(p==='/api/admin/export.csv'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="questions.csv"','Cache-Control':'no-store'});return res.end(csv(game.questions));}
    if(data!==null)return json(res,200,data);throw new CloudError('Không tìm thấy API',404);
   }
   if(!['POST','PUT','DELETE'].includes(method))throw new CloudError('Phương thức không hỗ trợ',405);
   if(p.startsWith('/api/admin/'))checkOrigin(req);
   const b=await body(req);const result=await store.mutate(ctx=>mutateRoute(ctx,method,p,b,req));
   return json(res,p==='/api/admin/questions'&&method==='POST'?201:200,result);
  }catch(e){if(res.headersSent){res.end();return;}json(res,e.status||400,{error:e.message||'Lỗi xử lý'});}
 };
}
module.exports={createHandler,mutateRoute,pathOf};
