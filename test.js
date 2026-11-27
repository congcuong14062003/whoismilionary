'use strict';
const assert=require('assert');
const {Game,normalizeAnswer,scoreAnswer,cleanQuestion}=require('./game');
const {WebhookAdapter,normalizeStreamerUsername}=require('./adapters');
const {DirectLiveAdapter,mapChat}=require('./direct-live');
const {EventEmitter}=require('events');
const {questions}=require('./questions');

for(const [input,want] of [['a','A'],['Đáp án B','B'],['chọn c','C'],['D.','D'],['A B',null],['ABC',null],['E',null]]) assert.strictEqual(normalizeAnswer(input),want,input);
assert.deepStrictEqual(scoreAnswer(true,0,20,3),{points:250,speed:100,bonus:50});
assert.deepStrictEqual(scoreAnswer(true,10,20,5),{points:300,speed:50,bonus:150});
assert.deepStrictEqual(scoreAnswer(true,20,20,10),{points:600,speed:0,bonus:500});
assert.strictEqual(scoreAnswer(false,0,20,10).points,0);
assert.throws(()=>cleanQuestion({...questions[0],id:'new'},questions),/trùng/);
assert.strictEqual(questions.length,100);
assert.strictEqual(normalizeStreamerUsername(' @Ten_Kenh '),'ten_kenh');
assert.throws(()=>normalizeStreamerUsername('https://tiktok.com/@ten_kenh'),/TikTok ID/);
const bridge=new WebhookAdapter(event=>({accepted:true,comment:event.comment}),()=> 'ten_kenh');
assert.throws(()=>bridge.receive({streamerUsername:'kenh_khac',comment:'A'}),/không thuộc/);
assert.deepStrictEqual(bridge.receive({streamerUsername:'@Ten_Kenh',comment:'A'}),{accepted:true,comment:'A'});
const mapped=mapChat({user:{id:'viewer-1',displayId:'viewer',nickname:'Người xem'},content:'A',common:{msgId:'event-1'}});
assert.strictEqual(mapped.userId,'viewer-1');assert.strictEqual(mapped.comment,'A');assert.strictEqual(mapped.eventId,'event-1');

const t=Date.now(),g=new Game(null,()=>{});g.start(t);const q=g.current();
const comment=(userId,text,at,eventId)=>g.comment({userId,username:userId,comment:text,timestamp:at,eventId},at);
assert.strictEqual(comment('u1','đáp án '+q.answer,t+1000,'evt-1').accepted,true);
assert.strictEqual(comment('u1','B',t+2000,'evt-2').reason,'already-answered');
assert.strictEqual(comment('u2','A',t+2500,'evt-1').reason,'duplicate-event');
assert.strictEqual(comment('u2','E',t+3000,'evt-3').reason,'invalid');
assert.strictEqual(Object.values(g.votes).reduce((a,b)=>a+b,0),1);
assert.strictEqual(comment('late','A',t+20000,'evt-4').reason,'closed');
g.tick(t+20000);assert.strictEqual(g.state.phase,'suspense');
assert.strictEqual(comment('later','A',t+20001,'evt-5').reason,'closed');
g.tick(t+23000);assert.strictEqual(g.state.phase,'reveal');
assert.strictEqual(g.state.phaseEndsAt,t+29000);
assert.strictEqual(g.players.u1.points,195);
g.tick(t+29000);assert.strictEqual(g.state.questionIndex,1);
g.pause(t+30000);const remaining=g.state.pausedRemaining;
g.tick(t+60000);assert.strictEqual(g.state.status,'paused');
g.resume(t+60000);assert.strictEqual(g.state.phaseEndsAt,t+60000+remaining);
const restored=new Game(g.persist(),()=>{});assert.strictEqual(restored.state.questionId,g.state.questionId);
assert.strictEqual(restored.players.u1.points,195);

const custom=new Game(null,()=>{});custom.settings.revealDuration=12;custom.start(t);custom.tick(t+20000);custom.tick(t+23000);assert.strictEqual(custom.state.phaseEndsAt,t+35000);custom.tick(t+34999);assert.strictEqual(custom.state.phase,'reveal');custom.tick(t+35000);assert.strictEqual(custom.state.questionIndex,1);
custom.settings.breakDuration=18;custom.state.questionIndex=14;custom.afterReveal(t+40000);assert.strictEqual(custom.state.phase,'finished');assert.strictEqual(custom.state.phaseEndsAt,t+58000);

const manual=new Game(null,()=>{});manual.settings.auto=false;manual.start(t);manual.tick(t+20000);manual.tick(t+23000);manual.tick(t+29000);assert.strictEqual(manual.state.phase,'intermission');assert.strictEqual(manual.state.phaseEndsAt,0);manual.tick(t+3600000);assert.strictEqual(manual.state.phase,'intermission');manual.settings.auto=true;manual.tick(t+3600001);assert.strictEqual(manual.state.phase,'question');assert.strictEqual(manual.state.phaseEndsAt,t+3620001);
const legacy=new Game({...manual.persist(),settings:{...manual.settings,auto:false},state:{...manual.state,phase:'intermission',phaseEndsAt:Number.MAX_SAFE_INTEGER}},()=>{});assert.strictEqual(legacy.state.phaseEndsAt,0);

class FakeConnection extends EventEmitter {async connect(){return {roomId:'room-1'};}async disconnect(){this.emit('disconnected');}}
const directStatuses=[],directEvents=[];
const direct=new DirectLiveAdapter(event=>directEvents.push(event),status=>directStatuses.push(status),async()=>({TikTokLiveConnection:FakeConnection,WebcastEvent:{CHAT:'chat',STREAM_END:'streamEnd'},ControlEvent:{DISCONNECTED:'disconnected',ERROR:'error'}}));
direct.start('@ten_kenh');
setImmediate(()=>{
  try {
    assert.strictEqual(directStatuses[directStatuses.length-1].status,'Đã kết nối LIVE');
    direct.connection.emit('chat',{user:{id:'viewer-1',displayId:'viewer'},content:'B'});
    assert.strictEqual(directEvents.length,1);
    assert.strictEqual(directEvents[0].comment,'B');
    direct.stop();
    assert.strictEqual(directStatuses[directStatuses.length-1].status,'Đã ngắt kết nối LIVE');
    console.log('OK: 100 câu hỏi, comment, tính điểm, thời gian, khôi phục và kết nối LIVE.');
  } catch(error){console.error(error);process.exitCode=1;}
});
