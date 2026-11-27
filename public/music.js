(()=>{
 'use strict';
 const root=document.getElementById('app');
 if(root?.dataset.page!=='live'||new URLSearchParams(location.search).get('mute')==='1')return;
 const audio=document.createElement('audio');audio.src='/quiz-music.wav';audio.loop=true;audio.preload='auto';audio.id='quiz-background-music';document.body.append(audio);
 const button=document.createElement('button');button.type='button';button.textContent='♫ Bật nhạc nền';button.className='music-unlock';button.hidden=true;document.body.append(button);
 let wanted=false,attempting=false;
 async function play(){if(!wanted||attempting||!audio.paused)return;attempting=true;try{await audio.play();button.hidden=true;}catch{button.hidden=!wanted;}finally{attempting=false;}}
 button.addEventListener('click',()=>{void play();});
 document.addEventListener('quiz-state',event=>{
  const s=event.detail;wanted=!!s.settings.music&&s.status==='running';
  audio.volume=Math.max(0,Math.min(1,Number(s.settings.musicVolume??.22)));
  if(!s.settings.voice&&'speechSynthesis'in window)speechSynthesis.cancel();
  if(wanted){void play();}else{audio.pause();button.hidden=true;}
 });
 window.addEventListener('pagehide',()=>audio.pause());
})();
