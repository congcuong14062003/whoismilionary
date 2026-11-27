'use strict';
const cp=require('child_process');
const path=require('path');
const fs=require('fs');

if(!process.env.LIVE_NODE_BINARY) {
  try {
    const match=fs.readFileSync(path.join(__dirname,'.env'),'utf8').match(/^LIVE_NODE_BINARY=(.+)$/m);
    if(match) process.env.LIVE_NODE_BINARY=match[1].trim();
  } catch {}
}

function major(exe) {
  try {return Number(cp.execFileSync(exe,['--version'],{encoding:'utf8',timeout:3000}).trim().match(/^v(\d+)/)?.[1]||0);}catch{return 0;}
}
let candidates=[process.execPath];
try {
  const command=process.platform==='win32'?'where.exe':'which';
  const args=process.platform==='win32'?['node']:['-a','node'];
  candidates.push(...cp.execFileSync(command,args,{encoding:'utf8',timeout:3000}).split(/\r?\n/).filter(Boolean));
} catch {}
if(process.env.LIVE_NODE_BINARY)candidates.unshift(process.env.LIVE_NODE_BINARY);
const selected=[...new Set(candidates)].find(exe=>major(exe)>=22);
if(!selected){console.error('Kết nối TikTok LIVE cần Node.js 22 trở lên. Cài Node.js 22/24 hoặc đặt LIVE_NODE_BINARY tới node.exe phù hợp.');process.exit(1);}
const child=cp.spawn(selected,[path.join(__dirname,'server.js')],{cwd:__dirname,stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error.message);process.exit(1);});
child.on('exit',(code,signal)=>process.exit(code==null?(signal?1:0):code));
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
