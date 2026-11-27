'use strict';
const fs=require('fs'),path=require('path');
const sampleRate=22050,bpm=96,beat=60/bpm,duration=40,length=Math.round(sampleRate*duration);
const samples=new Float64Array(length),freq=m=>440*Math.pow(2,(m-69)/12);
function note(start,seconds,midi,volume,kind='pad'){
 const n=Math.floor(seconds*sampleRate),offset=Math.floor(start*sampleRate),f=freq(midi);
 for(let j=0;j<n&&offset+j<length;j++){const t=j/sampleRate,u=j/n;let env,wave;
  if(kind==='pad'){env=Math.sin(Math.PI*u)**1.4;wave=Math.sin(2*Math.PI*f*t)+.18*Math.sin(2*Math.PI*f*2*t+.4);}
  else{env=Math.min(1,t/.018)*Math.exp(-t/(kind==='bass'?.25:.20));wave=Math.sin(2*Math.PI*f*t)+.13*Math.sin(2*Math.PI*f*2*t);}
  samples[offset+j]+=volume*env*wave;
 }
}
// Original minor-key suspense bed: slow pads, restrained bass pulse and a quiet arpeggio.
const chords=[[52,55,59,66],[48,52,55,59],[45,48,52,59],[47,51,54,57]];
for(let bar=0;bar<16;bar++){
 const chord=chords[Math.floor(bar/2)%4],start=bar*4*beat;
 for(const m of chord)note(start,4*beat,m,.055,'pad');
 for(let b=0;b<4;b++)note(start+b*beat,.45,chord[0]-12,b%2===0?.14:.07,'bass');
 const arp=[0,2,1,2,0,3,1,2];for(let i=0;i<8;i++)note(start+i*beat/2,.55,chord[arp[i]]+12,.021,'arp');
}
let peak=0;for(const s of samples)peak=Math.max(peak,Math.abs(s));
const out=Buffer.alloc(44+length*2);out.write('RIFF');out.writeUInt32LE(36+length*2,4);out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(length*2,40);
for(let i=0;i<length;i++){const edge=Math.min(1,i/(sampleRate*.04),(length-1-i)/(sampleRate*.12));out.writeInt16LE(Math.round(samples[i]/peak*.7*32767*edge),44+i*2);}
fs.writeFileSync(path.resolve(__dirname,'../public/quiz-music.wav'),out);console.log('Created original 40-second suspense loop: '+out.length+' bytes.');
