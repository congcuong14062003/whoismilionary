'use strict';
const crypto=require('crypto');

function normalizeStreamerUsername(value) {
  const username=String(value||'').trim().replace(/^@/,'').toLowerCase();
  if (!/^[a-z0-9._]{2,32}$/.test(username)) throw Error('TikTok ID phải gồm 2–32 ký tự chữ, số, dấu chấm hoặc gạch dưới');
  return username;
}

class MockAdapter {
  constructor(emit) { this.emit=emit; this.mode='mock'; }
  simulate(count) {
    const total=Math.max(1,Math.min(1000,Number(count)||10));
    const choices=['A','B','C','D']; let accepted=0;
    for(let i=0;i<total;i++) {
      const id=`mock-${i+1}`;
      const result=this.emit({ userId:id,username:id,nickname:`Khán giả ${i+1}`,avatar:'',comment:choices[Math.floor(Math.random()*4)],timestamp:Date.now(),eventId:crypto.randomBytes(12).toString('hex') });
      if(result.accepted) accepted++;
    }
    return { attempted:total,accepted };
  }
}

// This adapter accepts events from a bridge the host operates. It does not claim
// to connect to TikTok itself; a permitted provider must supply the bridge.
class WebhookAdapter {
  constructor(emit,getStreamerUsername) { this.emit=emit; this.getStreamerUsername=getStreamerUsername; this.mode='webhook'; }
  receive(input) {
    if(!input || typeof input!=='object') throw Error('Sự kiện không hợp lệ');
    const expected=this.getStreamerUsername();
    if(!expected) throw Error('Chưa cấu hình TikTok ID người phát trong trang quản trị');
    if(normalizeStreamerUsername(input.streamerUsername)!==expected) throw Error('Sự kiện không thuộc TikTok ID đang cấu hình');
    return this.emit({ userId:input.userId,username:input.username,nickname:input.nickname,avatar:input.avatar,comment:input.comment,timestamp:input.timestamp,eventId:input.eventId });
  }
}
module.exports={MockAdapter,WebhookAdapter,normalizeStreamerUsername};
