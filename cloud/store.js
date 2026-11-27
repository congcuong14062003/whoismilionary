'use strict';
const crypto=require('crypto');
const {Game}=require('../game');
const {questions:seed}=require('../questions');
const RELEASE="if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const COMMIT="if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end if ARGV[3] ~= '' and redis.call('GET',KEYS[3]) ~= ARGV[3] then return 0 end redis.call('SET',KEYS[2],ARGV[2]) redis.call('DEL',KEYS[1]) return 1";
const LEASE="local owner=redis.call('GET',KEYS[1]); if not owner or owner == ARGV[1] then redis.call('SET',KEYS[1],ARGV[1],'PX',ARGV[2]); return 1 end return 0";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class CloudError extends Error{constructor(message,status=503){super(message);this.status=status;}}
class RedisRest{
 constructor(env=process.env){this.url=env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL;this.token=env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;}
 async command(args){
  if(!this.url||!this.token)throw new CloudError('Chưa kết nối Redis. Vào Vercel → Storage → Connect Upstash Redis, rồi Redeploy. Cần UPSTASH_REDIS_REST_URL/TOKEN hoặc KV_REST_API_URL/TOKEN.');
  let r;try{r=await fetch(this.url.replace(/\/$/,''),{method:'POST',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});}catch{throw new CloudError('Không kết nối được Redis. Kiểm tra cấu hình Storage trên Vercel.');}
  const data=await r.json().catch(()=>({}));if(!r.ok||data.error)throw new CloudError('Redis chưa sẵn sàng. Kiểm tra URL, token và hạn mức của database.');return data.result;
 }
}
class CloudStore{
 constructor(redis=new RedisRest(),prefix){this.redis=redis;this.prefix=prefix||process.env.QUIZ_STORAGE_KEY||('millionaire:'+((process.env.VERCEL_ENV==='preview')?'preview:'+String(process.env.VERCEL_GIT_COMMIT_REF||'default'):'production'));this.bankCache=new Map();}
 key(s){return this.prefix+':'+s;}
 async context(raw){
  const doc=raw?JSON.parse(raw):{bankVersion:'seed',game:null,connection:null,desiredUsername:'',seenEvents:[]};
  let bank=this.bankCache.get(doc.bankVersion);
  if(!bank){if(doc.bankVersion==='seed')bank=seed;else{const b=await this.redis.command(['GET',this.key('bank:'+doc.bankVersion)]);if(!b)throw new CloudError('Không tìm thấy kho câu hỏi đã lưu.');bank=JSON.parse(b);}this.bankCache.clear();this.bankCache.set(doc.bankVersion,bank);}
  const game=new Game({...doc.game,questions:structuredClone(bank)},()=>{});
  if(doc.connection)game.connection=doc.connection;
  game.seenEvents=new Map(doc.seenEvents||[]);
  return {game,doc,desiredUsername:doc.desiredUsername||'',bankDirty:false};
 }
 advance(game){
  for(let n=0;n<2000;n++){const before=game.state.revision;game.tick();if(game.state.revision===before)break;}
 }
 due(doc){const s=doc?.game?.state,t=doc?.game?.settings;return s?.status==='running'&&((s.phase==='intermission'&&t.auto)||(s.phaseEndsAt>0&&s.phaseEndsAt<=Date.now()&&s.phase!=='idle'&&(s.phase!=='finished'||t.auto)));}
 async read(){
  const raw=await this.redis.command(['GET',this.key('state')]);
  if(raw&&this.due(JSON.parse(raw)))return this.mutate(ctx=>({snapshot:ctx.game.publicState(),desiredUsername:ctx.desiredUsername}));
  const ctx=await this.context(raw);return {snapshot:ctx.game.publicState(),desiredUsername:ctx.desiredUsername};
 }
 async mutate(fn,{leaseToken=''}={}){
  const token=crypto.randomUUID(),lock=this.key('lock');let held=false;
  for(let n=0;n<120;n++){if(await this.redis.command(['SET',lock,token,'NX','PX','15000'])){held=true;break;}await sleep(15+Math.random()*20);}
  if(!held)throw new CloudError('Máy chủ đang xử lý bình luận. Vui lòng thử lại.',429);
  try{
   const raw=await this.redis.command(['GET',this.key('state')]),ctx=await this.context(raw);
   this.advance(ctx.game);
   const result=await fn(ctx);
   const previous=ctx.doc.bankVersion;
   if(ctx.bankDirty){ctx.doc.bankVersion=crypto.randomUUID();await this.redis.command(['SET',this.key('bank:'+ctx.doc.bankVersion),JSON.stringify(ctx.game.questions)]);}
   const game=ctx.game.persist();delete game.questions;
   const seen=[...ctx.game.seenEvents].filter(([,at])=>at>Date.now()-3600000).slice(-10000);
   const next=JSON.stringify({bankVersion:ctx.doc.bankVersion,game,connection:ctx.game.connection,desiredUsername:ctx.desiredUsername,seenEvents:seen});
   if(next!==raw){
    const committed=await this.redis.command(['EVAL',COMMIT,3,lock,this.key('state'),this.key('worker'),token,next,leaseToken]);
    if(!committed)throw new CloudError('Phiên xử lý đã đổi. Vui lòng thử lại.',409);
    held=false;
    if(ctx.bankDirty&&previous!=='seed')await this.redis.command(['EXPIRE',this.key('bank:'+previous),'86400']).catch(()=>{});
   }
   return result;
  }finally{if(held)await this.redis.command(['EVAL',RELEASE,1,lock,token]).catch(()=>{});}
 }
 claimWorker(token){return this.redis.command(['EVAL',LEASE,1,this.key('worker'),token,'30000']);}
 releaseWorker(token){return this.redis.command(['EVAL',RELEASE,1,this.key('worker'),token]);}
}
module.exports={CloudStore,RedisRest,CloudError,RELEASE,COMMIT,LEASE};
