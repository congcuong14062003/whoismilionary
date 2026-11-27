'use strict';

const crypto = require('crypto');
const { questions: seed, letters } = require('./questions');
const PRIZES = [200000,400000,600000,1000000,2000000,3000000,6000000,10000000,14000000,22000000,30000000,40000000,60000000,85000000,150000000];
const VALID = new Set(letters);

function normalizeAnswer(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().normalize('NFC').match(/^(?:(?:đáp\s*án|chọn)\s+)?([ABCD])[.!]?$/iu);
  return match ? match[1].toUpperCase() : null;
}
function cleanQuestion(input, known) {
  const text = String(input.text || '').trim();
  const options = Array.isArray(input.options) ? input.options.map(x => String(x).trim()) : [];
  const answer = String(input.answer || '').toUpperCase();
  if (text.length < 10 || text.length > 250 || options.length !== 4 || options.some(x => !x || x.length > 100) || !VALID.has(answer)) throw Error('Câu hỏi cần nội dung, bốn đáp án và đáp án đúng A–D');
  if (new Set(options.map(x => x.toLowerCase())).size !== 4) throw Error('Bốn đáp án phải khác nhau');
  if (known.some(q => q.text.toLocaleLowerCase('vi') === text.toLocaleLowerCase('vi') && q.id !== input.id)) throw Error('Câu hỏi trùng nội dung');
  return { id: input.id || crypto.randomBytes(8).toString('hex'), text, options, answer, explanation: String(input.explanation || '').trim().slice(0,500), topic: String(input.topic || 'Kiến thức tổng hợp').trim().slice(0,80), difficulty: Math.max(1,Math.min(15,Number(input.difficulty)||1)), seconds: Math.max(5,Math.min(120,Number(input.seconds)||20)), source: String(input.source || '').trim().slice(0,300), approved: !!input.approved };
}
function scoreAnswer(correct, elapsed, duration, streak) {
  if (!correct) return { points: 0, speed: 0, bonus: 0 };
  const speed = Math.max(0, Math.min(100, Math.round(100 * (duration - elapsed) / duration)));
  const bonus = streak === 3 ? 50 : streak === 5 ? 150 : streak === 10 ? 500 : 0;
  return { points: 100 + speed + bonus, speed, bonus };
}
function rank(players, filter) {
  return Object.values(players).filter(filter || (() => true)).sort((a,b) => b.points - a.points || a.correctTimeMs - b.correctTimeMs || a.name.localeCompare(b.name,'vi'));
}
class Game {
  constructor(saved, onChange) {
    this.onChange = onChange || (() => {});
    this.questions = (saved && saved.questions) || seed;
    this.players = (saved && saved.players) || {};
    this.history = (saved && saved.history) || [];
    this.round = (saved && saved.round) || 0;
    this.season = (saved && saved.season) || 1;
    this.settings = Object.assign({ duration:20, revealDuration:6, breakDuration:15, auto:true, showVotes:true, voice:false, music:true, musicVolume:0.22, volume:0.5, lifelineAt:0, streamerUsername:'' }, saved && saved.settings);
    this.state = Object.assign({ status:'idle', phase:'idle', questionIndex:0, questionId:null, phaseEndsAt:0, phaseStartedAt:0, pausedRemaining:0, revision:0, champion:null, hidden:[], hint:'', usedLifelines:[] }, saved && saved.state);
    if (this.state.phase === 'intermission') this.state.phaseEndsAt=0;
    this.votes = (saved && saved.votes) || {};
    this.answers = (saved && saved.answers) || {};
    this.recentCorrect = (saved && saved.recentCorrect) || [];
    this.seenEvents = new Map();
    this.connection = { mode:this.settings.streamerUsername?'idle':'mock', status:this.settings.streamerUsername?'Chưa kết nối LIVE':'Mô phỏng', username:this.settings.streamerUsername, connected:false, lastEventAt:null, received:0, lastComment:null, deliveryLagMs:null };
    if (this.state.status === 'running' && this.state.phase !== 'idle') this.tick();
  }
  persist() { return { questions:this.questions, players:this.players, history:this.history.slice(-1000), round:this.round, season:this.season, settings:this.settings, state:this.state, votes:this.votes, answers:this.answers, recentCorrect:this.recentCorrect }; }
  current() { return this.questions.find(q => q.id === this.state.questionId) || null; }
  publicState() {
    const q = this.current();
    const reveal = ['reveal','intermission','finished'].includes(this.state.phase);
    const votes = Object.fromEntries(letters.map(k => [k,this.votes[k] || 0]));
    const leaderboard = rank(this.players).slice(0,10).map(p => ({ id:p.id,name:p.name,avatar:p.avatar,points:p.points,streak:p.streak,correctTimeMs:p.correctTimeMs }));
    const connection={...this.connection,status:this.connection.mode==='webhook'?(this.connection.lastEventAt && Date.now()-this.connection.lastEventAt<30000?'Đang nhận comment qua bridge':'Chờ nguồn comment'):this.connection.mode==='mock'?'Mô phỏng':this.connection.status};
    return { ...this.state, now:Date.now(), round:this.round, season:this.season, prize:PRIZES[this.state.questionIndex] || 0, question:q ? { ...q, answer:reveal ? q.answer : null, explanation:reveal ? q.explanation : null } : null, votes, answerCount:Object.keys(this.answers).length, participantCount:Object.keys(this.players).length, leaderboard, recentCorrect:this.recentCorrect, settings:this.settings, connection, questionCount:this.questions.filter(x=>x.approved).length };
  }
  changed() { this.state.revision++; this.onChange(this.publicState()); }
  chooseQuestion(index) {
    const approved = this.questions.filter(q=>q.approved);
    const difficulty = index + 1;
    const candidates = approved.filter(q=>q.difficulty === difficulty);
    const pool = candidates.length ? candidates : approved;
    if (!pool.length) throw Error('Chưa có câu hỏi đã duyệt');
    const recent = new Set(this.history.slice(-30).map(x=>x.questionId));
    return pool.find(q=>!recent.has(q.id)) || pool[(this.round + index) % pool.length];
  }
  start(now=Date.now()) {
    if (this.state.status === 'running' && this.state.phase !== 'finished') throw Error('Game đang chạy');
    this.round++;
    for (const p of Object.values(this.players)) { p.points=0; p.streak=0; p.correctTimeMs=0; }
    this.state = { status:'running', phase:'question', questionIndex:0, questionId:null, phaseEndsAt:0, phaseStartedAt:now, pausedRemaining:0, revision:this.state.revision, champion:null, hidden:[], hint:'', usedLifelines:[] };
    this.nextQuestion(now);
  }
  nextQuestion(now=Date.now()) {
    const q = this.chooseQuestion(this.state.questionIndex);
    this.state.questionId=q.id; this.state.phase='question'; this.state.phaseStartedAt=now;
    this.state.phaseEndsAt=now+(this.settings.duration || q.seconds)*1000;
    this.state.hidden=[]; this.state.hint=''; this.state.usedLifelines=[];
    this.votes={}; this.answers={}; this.recentCorrect=[]; this.changed();
  }
  tick(now=Date.now()) {
    if (this.state.status !== 'running') return;
    if (this.state.phase === 'intermission') { if (this.settings.auto) this.nextQuestion(now); return; }
    if (this.state.phaseEndsAt > now) return;
    if (this.state.phase === 'question') this.lock(this.state.phaseEndsAt);
    else if (this.state.phase === 'suspense') this.reveal(this.state.phaseEndsAt);
    else if (this.state.phase === 'reveal') this.afterReveal(this.state.phaseEndsAt);
    else if (this.state.phase === 'finished' && this.settings.auto) this.start(this.state.phaseEndsAt);
  }
  lock(now=Date.now()) { if (this.state.phase!=='question') return; this.state.phase='suspense'; this.state.phaseStartedAt=now; this.state.phaseEndsAt=now+3000; this.changed(); }
  reveal(now=Date.now()) {
    if (this.state.phase!=='suspense') return;
    const q=this.current();
    for (const p of Object.values(this.players)) if (!this.answers[p.id]) p.streak=0;
    for (const entry of Object.values(this.answers)) {
      const p=this.players[entry.playerId]; const correct=entry.answer===q.answer;
      p.streak=correct ? p.streak+1 : 0;
      const score=scoreAnswer(correct,entry.elapsedMs/1000,(this.settings.duration||q.seconds),p.streak);
      p.points+=score.points;
      if (correct) { p.correctTimeMs+=entry.elapsedMs; this.recentCorrect.push({ name:p.name,avatar:p.avatar,points:score.points,streak:p.streak }); }
      entry.correct=correct; entry.score=score;
    }
    this.recentCorrect.sort((a,b)=>b.points-a.points); this.recentCorrect=this.recentCorrect.slice(0,5);
    this.history.push({ round:this.round, questionId:q.id, at:now, votes:this.votes, answers:Object.values(this.answers) });
    this.state.phase='reveal'; this.state.phaseStartedAt=now; this.state.phaseEndsAt=now+this.settings.revealDuration*1000; this.changed();
  }
  afterReveal(now=Date.now()) {
    if (this.state.questionIndex===14) {
      this.state.phase='finished'; this.state.champion=rank(this.players)[0] || null;
      this.state.phaseStartedAt=now; this.state.phaseEndsAt=now+this.settings.breakDuration*1000; this.changed(); return;
    }
    this.state.questionIndex++;
    if (this.settings.auto) this.nextQuestion(now);
    else { this.state.phase='intermission'; this.state.phaseStartedAt=now; this.state.phaseEndsAt=0; this.changed(); }
  }
  pause(now=Date.now()) { if (this.state.status!=='running') throw Error('Game chưa chạy'); this.state.pausedRemaining=this.state.phase==='intermission'?0:Math.max(0,this.state.phaseEndsAt-now); this.state.status='paused'; this.changed(); }
  resume(now=Date.now()) { if (this.state.status!=='paused') throw Error('Game chưa tạm dừng'); this.state.phaseStartedAt=now; this.state.phaseEndsAt=now+this.state.pausedRemaining; this.state.status='running'; this.changed(); }
  stop() { this.state.status='idle'; this.state.phase='idle'; this.state.phaseEndsAt=0; this.changed(); }
  skip(now=Date.now()) { if (this.state.status==='idle') throw Error('Game chưa bắt đầu'); this.state.questionIndex=(this.state.questionIndex+1)%15; this.nextQuestion(now); }
  comment(event, now=Date.now()) {
    const answer=normalizeAnswer(event.comment);
    if (!answer) return { accepted:false,reason:'invalid' };
    if (this.state.status!=='running' || this.state.phase!=='question' || now>=this.state.phaseEndsAt) return { accepted:false,reason:'closed' };
    const eventAt=Number(event.timestamp)||now;
    if (eventAt < this.state.phaseStartedAt || eventAt >= this.state.phaseEndsAt) return { accepted:false,reason:'outside-window' };
    const id=String(event.userId||event.username||'').trim();
    if (!id) return { accepted:false,reason:'missing-user' };
    const eventId=String(event.eventId||'');
    if (eventId && this.seenEvents.has(eventId)) return { accepted:false,reason:'duplicate-event' };
    if (this.answers[id]) return { accepted:false,reason:'already-answered' };
    if (eventId) this.seenEvents.set(eventId,now);
    if (this.seenEvents.size>10000) for (const [key,time] of this.seenEvents) if (time<now-3600000) this.seenEvents.delete(key);
    const p=this.players[id] || (this.players[id]={ id, name:'Người chơi',avatar:'',points:0,streak:0,correctTimeMs:0,joinedAt:now });
    p.name=String(event.nickname||event.username||p.name).trim().slice(0,50);
    p.avatar=String(event.avatar||p.avatar||'').slice(0,500);
    const elapsedMs=Math.max(0,eventAt-this.state.phaseStartedAt);
    this.answers[id]={ playerId:id,answer,elapsedMs,eventId,at:eventAt };
    this.votes[answer]=(this.votes[answer]||0)+1;
    this.connection.lastEventAt=now;
    this.changed();
    return { accepted:true,answer,elapsedMs };
  }
  lifeline(type) {
    const q=this.current(); if (!q || this.state.phase!=='question') throw Error('Chỉ dùng trợ giúp khi câu hỏi đang mở');
    if (this.state.usedLifelines.includes(type)) throw Error('Trợ giúp đã dùng cho câu này');
    if (type==='fifty') this.state.hidden=letters.filter(x=>x!==q.answer).slice(0,2);
    else if (type==='audience') { const n=Object.values(this.votes).reduce((a,b)=>a+b,0); this.state.hint=n ? `Khán giả đã bình chọn ${n} lượt` : 'Chưa có lượt bình chọn'; }
    else if (type==='ai') this.state.hint=q.explanation ? `Gợi ý: ${q.explanation.replace(q.options[letters.indexOf(q.answer)],'đáp án').slice(0,120)}` : 'Hãy suy luận từ các lựa chọn.';
    else throw Error('Trợ giúp không hợp lệ');
    this.state.usedLifelines.push(type); this.changed();
  }
}
module.exports={Game,normalizeAnswer,scoreAnswer,cleanQuestion,rank,PRIZES};
