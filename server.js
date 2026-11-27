'use strict';
const http=require('http');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const os=require('os');
function lanIp(){const addresses=Object.values(os.networkInterfaces()).flat().filter(x=>x&&x.family==='IPv4'&&!x.internal).map(x=>x.address);return addresses.find(x=>x.startsWith('192.168.'))||addresses.find(x=>x.startsWith('10.'))||addresses.find(x=>/^172\.(1[6-9]|2\d|3[01])\./.test(x))||addresses[0]||null;}
const {Game,cleanQuestion}=require('./game');
const {MockAdapter,WebhookAdapter,normalizeStreamerUsername}=require('./adapters');
const {DirectLiveAdapter}=require('./direct-live');

const envPath=path.join(__dirname,'.env');
if(fs.existsSync(envPath)) for(const line of fs.readFileSync(envPath,'utf8').split(/\r?\n/)) {
  const m=line.match(/^([A-Z_]+)=(.*)$/); if(m && process.env[m[1]]===undefined) process.env[m[1]]=m[2];
}
const HOST=process.env.HOST||'127.0.0.1', PORT=Number(process.env.PORT)||8093;
const dataPath=path.resolve(__dirname,process.env.DATA_FILE||'data/state.json');
let saved=null; try { saved=JSON.parse(fs.readFileSync(dataPath,'utf8')); } catch {}
const webhookSecret=process.env.COMMENT_WEBHOOK_SECRET||'';
const clients=new Set();
let saveTimer=null;
function save() { fs.mkdirSync(path.dirname(dataPath),{recursive:true}); const tmp=dataPath+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(game.persist())); fs.renameSync(tmp,dataPath); }
function changed(state) {
  const data=`data: ${JSON.stringify(state)}\n\n`;
  for(const res of clients) { try {res.write(data);} catch {clients.delete(res);} }
  clearTimeout(saveTimer); saveTimer=setTimeout(save,150);
}
const game=new Game(saved,changed);
const mock=new MockAdapter(event=>game.comment(event));
const webhook=new WebhookAdapter(event=>game.comment(event),()=>game.settings.streamerUsername);
const direct=new DirectLiveAdapter(event=>{
  const result=game.comment(event);
  game.connection.received=(game.connection.received||0)+1;
  game.connection.lastEventAt=Date.now();
  game.connection.lastComment={name:event.nickname||event.username,content:event.comment,accepted:result.accepted,reason:result.reason||''};
  game.connection.deliveryLagMs=event.deliveryLagMs;
  game.changed();
},connection=>{game.connection={...game.connection,...connection};game.changed();});
if(process.env.AUTO_START==='true' && game.state.status==='idle') game.start();
setInterval(()=>game.tick(),100);

function json(res,status,obj,extra={}) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}); res.end(JSON.stringify(obj)); }
function fail(res,status,message) { json(res,status,{error:message}); }
function readBody(req,limit=1048576) { return new Promise((resolve,reject)=>{let body=''; req.setEncoding('utf8'); req.on('data',chunk=>{body+=chunk;if(Buffer.byteLength(body)>limit){reject(Error('Nội dung quá lớn'));req.destroy();}});req.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch{reject(Error('JSON không hợp lệ'));}});req.on('error',reject);}); }
function sameOrigin(req) { const origin=req.headers.origin; if(!origin) return true; try {const url=new URL(origin);return url.host===req.headers.host;} catch{return false;} }
function constantEqual(a,b) { const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length && crypto.timingSafeEqual(x,y); }
function csvEscape(x) { const s=String(x==null?'':x);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function renderCsv(rows) { const keys=['id','text','A','B','C','D','answer','explanation','topic','difficulty','seconds','source','approved'];return [keys.join(','),...rows.map(q=>[q.id,q.text,...q.options,q.answer,q.explanation,q.topic,q.difficulty,q.seconds,q.source,q.approved].map(csvEscape).join(','))].join('\n'); }
function serve(res,pathname) {
  const map={'/':'live.html','/live':'live.html','/overlay':'overlay.html','/admin':'admin.html','/questions':'admin.html','/leaderboard':'leaderboard.html','/demo':'demo.html','/app.css':'app.css','/admin-enhance.css':'admin-enhance.css','/live-layout.css':'live-layout.css','/app.js':'app.js','/music.js':'music.js','/quiz-music.wav':'quiz-music.wav'};
  const filename=map[pathname]; if(!filename) return fail(res,404,'Không tìm thấy');
  const file=path.join(__dirname,'public',filename);
  fs.readFile(file,(err,body)=>{if(err)return fail(res,404,'Không tìm thấy');res.writeHead(200,{'Content-Type':filename.endsWith('.wav')?'audio/wav':filename.endsWith('.css')?'text/css; charset=utf-8':filename.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self'; base-uri 'none'; frame-ancestors 'self'"});res.end(body);});
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`), p=url.pathname;
  if(req.method==='GET' && p==='/api/events') {res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify(game.publicState())}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return;}
  if(req.method==='GET' && p==='/api/state') return json(res,200,game.publicState());
  if(req.method==='GET' && p==='/api/network') return json(res,200,{lanIp:lanIp()});
  if(req.method==='GET' && p==='/api/leaderboard') return json(res,200,game.publicState().leaderboard);
  if(req.method==='POST' && p==='/api/comment-webhook') {if(!webhookSecret || !constantEqual(req.headers['x-webhook-secret']||'',webhookSecret))return fail(res,401,'Webhook chưa cấu hình hoặc secret sai');if(direct.desired)return fail(res,409,'Đang dùng kết nối LIVE trực tiếp');try{const body=await readBody(req);const result=webhook.receive(body);game.connection.mode='webhook';game.connection.username=game.settings.streamerUsername;game.connection.lastEventAt=Date.now();game.changed();return json(res,200,result);}catch(e){return fail(res,400,e.message);}}
  if(p.startsWith('/api/admin/')) {
    if(req.method!=='GET' && !sameOrigin(req))return fail(res,403,'Nguồn yêu cầu không hợp lệ');
    try {
      if(req.method==='GET' && p==='/api/admin/questions')return json(res,200,game.questions);
      if(req.method==='GET' && p==='/api/admin/history')return json(res,200,game.history.slice(-100));
      if(req.method==='GET' && p==='/api/admin/players')return json(res,200,Object.values(game.players));
      if(req.method==='GET' && p==='/api/admin/current-answer')return json(res,200,{questionId:game.state.questionId,answer:game.current()?.answer||null});
      if(req.method==='POST' && p==='/api/admin/source') {const body=await readBody(req);const username=body.username?normalizeStreamerUsername(body.username):'';if(username!==game.settings.streamerUsername)direct.stop(false);game.settings.streamerUsername=username;if(!direct.desired)game.connection={mode:username?'idle':'mock',status:username?'Chưa kết nối LIVE':'Mô phỏng',username,connected:false,lastEventAt:null};game.changed();return json(res,200,game.connection);}
      if(req.method==='POST' && p==='/api/admin/live-connect') {const body=await readBody(req);const username=normalizeStreamerUsername(body.username||game.settings.streamerUsername);game.settings.streamerUsername=username;game.connection={mode:'direct',status:'Đang kết nối LIVE',username,connected:false,lastEventAt:null,received:0,lastComment:null,deliveryLagMs:null};direct.start(username);return json(res,200,game.publicState().connection);}
      if(req.method==='POST' && p==='/api/admin/live-disconnect') {direct.stop();return json(res,200,game.publicState().connection);}
      if(req.method==='GET' && p==='/api/admin/export.json')return json(res,200,game.questions);
      if(req.method==='GET' && p==='/api/admin/export.csv'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="questions.csv"'});return res.end('\ufeff'+renderCsv(game.questions));}
      const body=await readBody(req);
      if(req.method==='POST' && p==='/api/admin/control') {
        const action=body.action, now=Date.now();
        if(action==='start')game.start(now);else if(action==='pause')game.pause(now);else if(action==='resume')game.resume(now);else if(action==='stop')game.stop();else if(action==='next')game.skip(now);else if(action==='lock')game.lock(now);else if(action==='reveal')game.reveal(now);else if(action==='reset-scores'){for(const p of Object.values(game.players)){p.points=0;p.streak=0;p.correctTimeMs=0;}game.changed();}else if(action==='new-season'){game.season++;game.players={};game.history=[];game.round=0;game.votes={};game.answers={};game.recentCorrect=[];game.stop();}else throw Error('Thao tác không hợp lệ');
        return json(res,200,game.publicState());
      }
      if(req.method==='POST' && p==='/api/admin/settings') {for(const key of ['duration','revealDuration','breakDuration','auto','showVotes','voice','volume','music','musicVolume'])if(Object.prototype.hasOwnProperty.call(body,key))game.settings[key]=key==='duration'?Math.max(5,Math.min(120,Number(body[key])||20)):key==='revealDuration'?Math.max(1,Math.min(30,Number(body[key])||6)):key==='breakDuration'?Math.max(0,Math.min(30,Number(body[key])||0)):(key==='volume'||key==='musicVolume')?Math.max(0,Math.min(1,Number(body[key])||0)):!!body[key];game.changed();return json(res,200,game.settings);}
      if(req.method==='POST' && p==='/api/admin/lifeline'){game.lifeline(body.type);return json(res,200,game.publicState());}
      if(req.method==='POST' && p==='/api/admin/simulate')return json(res,200,mock.simulate(body.count));
      if(req.method==='POST' && p==='/api/admin/comment')return json(res,200,game.comment({userId:body.userId||`manual-${Date.now()}`,username:body.username||'Khách thử',nickname:body.nickname||body.username||'Khách thử',comment:body.comment,eventId:crypto.randomBytes(12).toString('hex'),timestamp:Date.now()}));
      if(req.method==='POST' && p==='/api/admin/questions') {const q=cleanQuestion(body,game.questions);game.questions.push(q);game.changed();return json(res,201,q);}
      if(req.method==='PUT' && p.startsWith('/api/admin/questions/')) {const id=decodeURIComponent(p.split('/').pop()),i=game.questions.findIndex(q=>q.id===id);if(i<0)return fail(res,404,'Không tìm thấy câu hỏi');const q=cleanQuestion({...game.questions[i],...body,id},game.questions);game.questions[i]=q;game.changed();return json(res,200,q);}
      if(req.method==='DELETE' && p.startsWith('/api/admin/questions/')) {const id=decodeURIComponent(p.split('/').pop());game.questions=game.questions.filter(q=>q.id!==id);game.changed();return json(res,200,{ok:true});}
      if(req.method==='POST' && p==='/api/admin/import') {if(!Array.isArray(body.questions))throw Error('Cần mảng questions');const incoming=[];for(const item of body.questions) incoming.push(cleanQuestion(item,[...game.questions,...incoming]));game.questions.push(...incoming);game.changed();return json(res,200,{inserted:incoming.length});}
      return fail(res,404,'Không tìm thấy API');
    } catch(e){return fail(res,400,e.message);}
  }
  if(req.method==='GET')return serve(res,p);
  return fail(res,405,'Phương thức không hỗ trợ');
});
server.on('error',e=>{console.error(e);process.exit(1);});
server.listen(PORT,HOST,()=>{console.log(`Game: http://127.0.0.1:${PORT}/live`);console.log(`Admin: http://127.0.0.1:${PORT}/admin`);if(HOST==='0.0.0.0'&&lanIp())console.log(`Điện thoại cùng mạng: http://${lanIp()}:${PORT}/live`);console.log(webhookSecret?'Webhook: đã cấu hình secret, chờ nguồn sự kiện':'Webhook: chưa cấu hình; dùng mô phỏng');});
process.on('SIGINT',()=>{direct.stop(false);save();server.close(()=>process.exit(0));});
