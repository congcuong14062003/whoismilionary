'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const {cleanQuestion}=require('../game');
const dir=path.resolve(__dirname,'../question-bank'),cache=path.join(dir,'build-cache');
const all=JSON.parse(fs.readFileSync(path.join(cache,'candidates.json'),'utf8'));
const vi=JSON.parse(fs.readFileSync(path.join(cache,'vi.json'),'utf8'));
const existing=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/state.json'),'utf8')).questions;
const prior=JSON.parse(fs.readFileSync(path.join(dir,'CAU_HOI_THE_GIOI_2000.json'),'utf8')).questions;existing.push(...prior);
const {questions:seed}=require('../questions');
const topics={arts:'Văn học và nghệ thuật',film:'Điện ảnh',food:'Ẩm thực thế giới',geography:'Địa lý thế giới',history:'Lịch sử thế giới',math:'Toán học',music:'Âm nhạc',mythology:'Thần thoại và văn hóa',nature:'Thiên nhiên và sinh học',science:'Khoa học',space:'Vũ trụ',sports:'Thể thao',technology:'Công nghệ'};
const clean=x=>String(x).normalize('NFC').replace(/\s+/g,' ').trim();
const norm=x=>clean(x).toLocaleLowerCase('vi').replace(/[.,?!:;'"“”‘’]/g,'').trim();
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const glossary={Subway:'Subway','Birds Eye':'Birds Eye','Milky Way':'Milky Way',Shell:'Shell',Apple:'Apple',Amazon:'Amazon',Windows:'Windows',Word:'Word',Excel:'Excel',PowerPoint:'PowerPoint',Access:'Access',Edge:'Edge',Chrome:'Chrome',Safari:'Safari',Firefox:'Firefox',Opera:'Opera',Slack:'Slack',Discord:'Discord',Steam:'Steam',Switch:'Switch',PlayStation:'PlayStation',Xbox:'Xbox',Dracarys:'Dracarys',Baghdad:'Baghdad',Marzipan:'Marzipan','Tortilla chips (nachos)':'Bánh tortilla chiên (nachos)','From dried grapes':'Nho được sấy khô','Almonds and sugar':'Hạnh nhân và đường','A Song of Ice and Fire':'A Song of Ice and Fire (Băng và Lửa)','The Chronicles of Narnia':'Biên niên sử Narnia','Brother and Sister (Brüderchen und Schwesterchen)':'Anh trai và em gái (Brüderchen und Schwesterchen)'};
function translateTerm(x,q){if(/^(?:[A-Z][a-z]?\d*)+$/.test(x)&&x.length<=12)return x;const planets={Mercury:'Sao Thủy',Venus:'Sao Kim',Earth:'Trái Đất',Mars:'Sao Hỏa',Jupiter:'Sao Mộc',Saturn:'Sao Thổ',Uranus:'Sao Thiên Vương',Neptune:'Sao Hải Vương',Pluto:'Sao Diêm Vương'};if(planets[x]&&(q.category==='space'||/planet|solar|orbit/i.test(q.prompt)))return planets[x];if(['March Madness','Flavr Savr','Raspberry Pi','BlackBerry','Blue Origin','SpaceX','OpenAI','ChatGPT','Google','Bluetooth','Java','Python','Ruby','Swift','Go','Rust','Dart'].includes(x))return x;if(x==='Apple'&&!/\b(company|companies|founder|founded|computer|corporation|technology)\b/i.test(q.prompt)&&q.category!=='technology')return 'Táo';if(x==='Turkey'&&q.category==='food')return 'Thịt gà tây';if(x==='Drone'&&q.category==='nature')return 'Ong đực';if(x==='Calf'&&/dolphin/i.test(q.prompt))return 'Cá heo con';if(/^(who |which (?:author|writer|painter|artist|composer|actor|actress|scientist|explorer|astronaut|inventor|philosopher))/i.test(q.prompt)&&/^[A-ZÀ-ÖØ-Þ][\p{L}.'’-]+(?: [A-ZÀ-ÖØ-Þ][\p{L}.'’-]+)+$/u.test(x))return x;const names={Swatch:'Swatch',Fiat:'Fiat',Maxdome:'Maxdome',Blockbuster:'Blockbuster','Amazon Prime Video':'Amazon Prime Video',Phoenix:'Phoenix',Mecca:'Mecca','Günter Grass':'Günter Grass','Sugar glider':'Sóc bay Úc','Sugar gliders':'Sóc bay Úc',Wombat:'Gấu túi mũi trần','Wombats':'Gấu túi mũi trần',Rebound:'Bắt bóng bật bảng (rebound)',Steal:'Cướp bóng',Dunk:'Úp rổ',Assist:'Kiến tạo',Baldr:'Baldr',Baldur:'Baldur','The Styx':'Sông Styx','The Lethe':'Sông Lethe','More':'Lớn hơn',Less:'Nhỏ hơn',Golf:'Golf','Great heights':'Độ cao lớn'};if(names[x])return names[x];if(glossary[x]&&!(x==='Apple'&&q.category==='food')&&!(x==='Milky Way'&&q.category==='space'))return glossary[x];return clean(vi[clean(x)]||'');}
const corrections={
 'How many points does the Mercedes star have?':'Biểu tượng ngôi sao của Mercedes có bao nhiêu cánh?',
 'What is the time signature commonly known as common time?':'Trong âm nhạc, nhịp thường (common time) là nhịp nào?',
 'Which musical time signature is commonly called “common time”?':'Trong âm nhạc, nhịp thường (common time) là nhịp nào?',
 'Which material are curling stones made from?':'Viên đá thi đấu trong môn curling được làm từ vật liệu nào?',
 'What material are curling stones made from?':'Viên đá thi đấu trong môn curling được làm từ vật liệu nào?',
 'Which two testaments make up the Christian Bible?':'Kinh Thánh Kitô giáo gồm hai phần chính nào?',
 'According to legend, which fruit did William Tell shoot off his son’s head with a crossbow?':'Theo truyền thuyết, William Tell dùng nỏ bắn loại quả nào đặt trên đầu con trai mình?',

 'Who reached the Americas in 1492 while sailing for Spain?':'Nhà thám hiểm nào đến châu Mỹ năm 1492 trong chuyến đi do Tây Ban Nha bảo trợ?',
 'Which nut is marzipan made from?':'Loại hạt nào là nguyên liệu chính để làm marzipan?',
 'On which day was the euro introduced as cash?':'Tiền giấy và tiền xu euro bắt đầu được lưu hành vào ngày nào?',
 'How many animals make up the Town Musicians of Bremen?':'Trong truyện cổ Grimm “Những nhạc sĩ thành Bremen”, nhóm nhạc có bao nhiêu con vật?',
};
const banned=/\b(name one|currently|current|who is the|under .*law|german law|under 18|may not be sold|percentage .*|per cent .*|german chancellor|scholz|merkel|lindner|bible contain|who led.*circumnavigation|first.*east coast of australia|worldwide|most .*world|largest .*world|tallest .*world|how many .*moons|main ingredients.*concrete|how many .*islands|greatest|best.known|best.selling|two largest|covid restrictions|fish fingers|first fish|belly|anti-mush|modern PC|in which season|popcorn.*eaten|WHO as an addictive|purity law|400.gram package|green haribo|what was .*named after|stew.*stew|in german|literally|poodle|what is the complementary|mixing red and green paint|begins.*frankenstein|beginning.*frankenstein|subtitle.*eragon)\b/i;
const seen=new Set([...existing,...seed].map(q=>norm(q.text))),out=[],rejected=[],byAnswer=new Map();
const priorIds=new Set(prior.map(q=>q.id.replace('world-vi-v1-','')));
for(const q of all.filter(q=>priorIds.has(q.id))){const tokens=new Set(q.prompt.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>3&&!['which','what','does','with','from','where','that','have','many','this','were','when','their','called','name','known','country','city'].includes(w)));const k=q.category+'|'+norm(q.answer);if(!byAnswer.has(k))byAnswer.set(k,[]);byAnswer.get(k).push(tokens);}
for(const q of all){
 const text=corrections[q.prompt]||vi[clean(q.prompt)];
 if(!text||![q.answer,...q.distractors].every(x=>vi[clean(x)])){rejected.push([q.id,'missing translation']);continue;}
 if(/^(is|are|does|do)\b/i.test(q.prompt)||/\b(letter|english|phobia|phobes|hypochondriac|coldest|most .*medals|most Formula|most successful|first living|first animal|first life|first modern|between Windows 98 and Windows 500)\b/i.test(q.prompt)||banned.test(q.prompt)||/\b202[4-9]\b|\b203\d\b/.test(q.prompt)){rejected.push([q.id,'context or volatile']);continue;}
 let t=clean(text);if(q.category==='space')t=t.replace(/Hệ mặt trời/gi,'Hệ Mặt Trời');const ordinal=q.prompt.match(/^Which planet is the (\d+)(?:st|nd|rd|th) from the Sun\?$/);if(ordinal)t='Hành tinh nào đứng thứ '+ordinal[1]+' tính từ Mặt Trời?';const opts=[q.answer,...q.distractors].map(x=>translateTerm(x,q));
 if(t.length>170||t.length<10||opts.some(x=>!x||x.length>90)||new Set(opts.map(norm)).size!==4||opts.some(x=>/^(có|không|yes|no|đúng|sai)$/i.test(x))){rejected.push([q.id,'invalid choices or length']);continue;}
 const answer=opts[0];
 // Remove cases where translation gives away the answer in the question.
 if(answer.length>=5&&norm(t).includes(norm(answer))){rejected.push([q.id,'answer leakage']);continue;}
 if(seen.has(norm(t))){rejected.push([q.id,'existing or duplicate']);continue;}
 const enTokens=new Set(q.prompt.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>3&&!['which','what','does','with','from','where','that','have','many','this','were','when','their','called','name','known','country','city'].includes(w)));
 const key=q.category+'|'+norm(q.answer);
 if((byAnswer.get(key)||[]).some(prev=>{const overlap=[...enTokens].filter(x=>prev.has(x)).length;return overlap>=2&&overlap/Math.min(prev.size,enTokens.size)>=.8;})){rejected.push([q.id,'similar fact']);continue;}
 seen.add(norm(t));if(!byAnswer.has(key))byAnswer.set(key,[]);byAnswer.get(key).push(enTokens);
 out.push({original:q,text:t,options:opts,topic:topics[q.category],score:hash(q.id)});
}
console.log('ELIGIBLE '+out.length);
if(out.length<500)throw Error('Not enough eligible questions: '+out.length);
const byCat={};for(const x of out)(byCat[x.original.category]??=[]).push(x);
const picked=[],quota=40;
for(const [cat,rows] of Object.entries(byCat)){rows.sort((a,b)=>a.score-b.score);picked.push(...rows.splice(0,Math.min(rows.length,quota)));}
const extra=Object.values(byCat).flat().sort((a,b)=>a.score-b.score);picked.push(...extra.slice(0,500-picked.length));
picked.sort((a,b)=>a.original.difficulty-b.original.difficulty||a.score-b.score);
const ordered=picked.map((x,i)=>({...x,difficulty:Math.min(15,1+Math.floor(i*15/500))}));
ordered.sort((a,b)=>a.score-b.score);
const bank=ordered.map((x,i)=>{
 const correctIndex=i%4,options=[...x.options.slice(1)];
 options.sort((a,b)=>hash(a+x.original.id)-hash(b+x.original.id));options.splice(correctIndex,0,x.options[0]);
 return {id:'world-vi-extra1-'+x.original.id,text:x.text,options,answer:'ABCD'[correctIndex],explanation:'',topic:x.topic,difficulty:x.difficulty,seconds:20,source:'https://github.com/tamino-martinius/node-open-quiz-bank/blob/main/src/data/en/'+x.original.category+'.ts',approved:true};
});
const validated=[];
for(const q of bank){assert(![...existing,...seed].some(k=>k.id===q.id));validated.push(cleanQuestion(q,[...existing,...seed,...validated]));}
assert.equal(validated.length,500);assert.equal(new Set(bank.map(q=>q.id)).size,500);
const counts=key=>bank.reduce((a,q)=>(a[q[key]]=(a[q[key]]||0)+1,a),{});
const stats={total:500,topics:counts('topic'),difficulty:counts('difficulty'),answers:counts('answer'),format:'questions[]',language:'vi',version:1,date:'2026-11-27',bytes:0};
const payload={name:'Kiến thức thế giới - 500 câu tiếng Việt',version:1,language:'vi',license:'CC0-1.0',attribution:'Adapted and translated from open-quiz-bank by tamino-martinius; original question data CC0-1.0.',reviewStatus:'Bản dịch có lọc tự động và rà soát mẫu; chưa thẩm định độc lập toàn bộ đáp án.',questions:bank};
const filename=path.join(dir,'CAU_HOI_BO_SUNG_500.json');
fs.writeFileSync(filename,JSON.stringify(payload,null,2)+'\n');stats.bytes=fs.statSync(filename).size;
const csv=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
const rows=[['id','text','A','B','C','D','answer','explanation','topic','difficulty','seconds','source','approved'],...bank.map(q=>[q.id,q.text,...q.options,q.answer,q.explanation,q.topic,q.difficulty,q.seconds,q.source,q.approved])];
fs.writeFileSync(path.join(dir,'CAU_HOI_BO_SUNG_500.csv'),'\ufeff'+rows.map(r=>r.map(csv).join(',')).join('\r\n'));
fs.writeFileSync(path.join(dir,'THONG_KE_BO_SUNG.json'),JSON.stringify(stats,null,2));
fs.writeFileSync(path.join(cache,'selected-extra-original.json'),JSON.stringify(ordered.map(x=>x.original),null,2));
fs.writeFileSync(path.join(cache,'rejected-extra.json'),JSON.stringify(rejected,null,2));
console.log(JSON.stringify(stats,null,2));
