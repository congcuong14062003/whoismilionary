'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),https=require('https');
const dir=path.join(__dirname,'..','question-bank');fs.mkdirSync(dir,{recursive:true});
const cacheDir=path.join(dir,'build-cache');fs.mkdirSync(cacheDir,{recursive:true});
const origin='https://raw.githubusercontent.com/tamino-martinius/node-open-quiz-bank/main/';
const topics={arts:'Văn học và nghệ thuật',film:'Điện ảnh',food:'Ẩm thực thế giới',geography:'Địa lý thế giới',history:'Lịch sử thế giới',language:'Ngôn ngữ',math:'Toán học',music:'Âm nhạc',mythology:'Thần thoại',nature:'Thiên nhiên và sinh học',science:'Khoa học',space:'Vũ trụ',sports:'Thể thao',technology:'Công nghệ'};
function get(url){return new Promise((resolve,reject)=>{const req=https.get(url,{headers:{'User-Agent':'LocalQuizBank/1.0 (personal educational quiz)'}},res=>{let b='';res.setEncoding('utf8');res.on('data',x=>b+=x);res.on('end',()=>res.statusCode===200?resolve(b):reject(Error('HTTP '+res.statusCode+' '+url.slice(0,90))));});req.setTimeout(40000,()=>req.destroy(Error('timeout')));req.on('error',reject);});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function retry(fn){for(let n=0;n<4;n++){try{return await fn();}catch(e){if(n===3)throw e;await sleep(1500*(n+1));}}}
async function pool(items,n,fn){let at=0;await Promise.all(Array.from({length:n},async()=>{while(at<items.length){const i=at++;await fn(items[i],i);}}));}
const clean=x=>String(x).normalize('NFC').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
const norm=x=>clean(x).toLocaleLowerCase('vi').replace(/[.,?!:;'"“”‘’]/g,'').trim();
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
async function download(){
 let all=[];
 await pool(Object.keys(topics),3,async cat=>{
  const file=path.join(cacheDir,cat+'.ts');let code=fs.existsSync(file)?fs.readFileSync(file,'utf8'):await retry(()=>get(origin+'src/data/en/'+cat+'.ts'));fs.writeFileSync(file,code);
  const start=code.indexOf('= [');if(start<0)throw Error('Unexpected data format '+cat);
  const rows=vm.runInNewContext(code.slice(start+2),Object.create(null),{timeout:3000,contextCodeGeneration:{strings:false,wasm:false}});
  for(const q of rows)all.push({...q,category:cat});
  console.log(cat+': '+rows.length);
 });
 fs.writeFileSync(path.join(cacheDir,'source.json'),JSON.stringify(all,null,2));
 fs.writeFileSync(path.join(dir,'LICENSE-CC0.txt'),await get(origin+'src/data/LICENSE'));
 console.log('TOTAL SOURCE '+all.length);
}
async function translate(){
 const all=JSON.parse(fs.readFileSync(path.join(cacheDir,'source.json'),'utf8'));
 // Skip language-dependent riddles, volatile records, and references to outside context.
 const bad=/\b(current|currently|latest|today|now|this year|last year|most recent|tallest|largest|longest|oldest|richest|most populated|most populous|world record|record holder|first name|last name|surname|spelled|spelling|alphabet|anagram|rhyme|rhymes|letters|letter of|word for|literally mean|literal meaning|above|following image|pictured|shown here)\b/i;
 const base=all.filter(q=>q.category!=='language'&&!bad.test(q.prompt)&&q.prompt.length<=235&&q.answer&&Array.isArray(q.distractors)&&q.distractors.length===3&&new Set([q.answer,...q.distractors].map(norm)).size===4&&!/[<>]/.test(q.prompt)&&!/\b(all of|none of|both |A and B|B and C)\b/i.test([q.answer,...q.distractors].join(' ')));
 const keys=new Set(),candidates=[];
 for(const q of base){const k=norm(q.prompt);if(keys.has(k))continue;keys.add(k);candidates.push(q);}
 fs.writeFileSync(path.join(cacheDir,'candidates.json'),JSON.stringify(candidates,null,2));
 console.log('CANDIDATES '+candidates.length);
 const terms=[...new Set(candidates.flatMap(q=>[q.prompt,q.answer,...q.distractors]).map(clean))];
 const cacheFile=path.join(cacheDir,'vi.json');const cache=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile,'utf8')):{};
 const pending=terms.filter(x=>!cache[x]);let batches=[],batch=[],size=0;
 for(const term of pending){if(size+term.length+16>2400&&batch.length){batches.push(batch);batch=[];size=0;}batch.push(term);size+=term.length+16;}
 if(batch.length)batches.push(batch);
 console.log('TERMS '+terms.length+' PENDING '+pending.length+' BATCHES '+batches.length);
 await pool(batches,2,async (terms,i)=>{
  const q=terms.map((x,n)=>'###'+String(n).padStart(4,'0')+'### '+x).join('\n');
  const raw=await retry(()=>get('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q='+encodeURIComponent(q)));
  const translated=JSON.parse(raw)[0].map(x=>x[0]||'').join('');
  const parts=[...translated.matchAll(/#{2,}\s*(\d{4})\s*#{2,}\s*([\s\S]*?)(?=#{2,}\s*\d{4}\s*#{2,}|$)/g)];
  if(parts.length!==terms.length)throw Error('Translation marker mismatch batch '+i+' '+parts.length+'/'+terms.length);
  for(const m of parts){const idx=Number(m[1]);if(!terms[idx])throw Error('Unexpected marker');cache[terms[idx]]=clean(m[2]);}
  fs.writeFileSync(cacheFile,JSON.stringify(cache,null,2));
  if(i%5===0||i===batches.length-1)console.log('TRANSLATED '+(i+1)+'/'+batches.length);
  await sleep(250);
 });
}
if(process.argv[2]==='download')download().catch(e=>{console.error(e);process.exitCode=1;});
if(process.argv[2]==='translate')translate().catch(e=>{console.error(e);process.exitCode=1;});
