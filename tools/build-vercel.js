'use strict';
const fs=require('fs');
for(const p of ['public/live.html','public/admin.html','public/app.js','public/live-layout.css','public/music.js','public/quiz-music.wav','api/index.js'])if(!fs.existsSync(p))throw Error('Thiếu file '+p);
console.log('Vercel: static frontend in public/; serverless APIs in api/index.js; Redis state storage.');
console.log('Connect Upstash Redis to the Vercel project and redeploy to enable game controls.');
