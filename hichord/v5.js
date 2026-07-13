(()=>{
'use strict';

const NOTE_NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const MAJOR=[0,2,4,5,7,9,11];
const QUALITIES=['maj','min','min','maj','maj','min','dim'];
const MOD_NAMES={base:'Base',flip:'Major / minor',dom7:'Dominant 7',maj7:'Major 7',nine:'Ninth',sus4:'Sus 4',sweet:'Sixth',dim:'Diminished',aug:'Augmented'};
const DESIGN_W=1100, DESIGN_H=540, VOICE_COUNT=6;

let audio=null, master=null, compressor=null;
let voicePool=[];
let keyIndex=Number(localStorage.getItem('hc-key')||0);
let selectedDegree=Number(localStorage.getItem('hc-degree')||0);
let currentMod='base';
let strum=localStorage.getItem('hc-strum')==='1';
let hold=localStorage.getItem('hc-hold')==='1';
let soundMode=localStorage.getItem('hc-sound')||'warm';
let joyTouchId=null, joyMouseDown=false, orphanedJoy=false;
let lastJoyHaptic='base';

const $=s=>document.querySelector(s);
const display=$('#display'), statusChord=$('#statusChord'), statusMod=$('#statusMod'), statusSound=$('#statusSound');
const joyArea=$('#joyArea'), joyStick=$('#joyStick'), volume=$('#volume');
const startOverlay=$('#startOverlay'), installHelp=$('#installHelp'), stage=$('#stage'), stageWrap=$('#stageWrap');

function holdParam(param,time){
  if(typeof param.cancelAndHoldAtTime==='function') param.cancelAndHoldAtTime(time);
  else { const value=param.value; param.cancelScheduledValues(time); param.setValueAtTime(value,time); }
}

function haptic(kind='light'){
  try{
    if(typeof navigator.vibrate==='function') navigator.vibrate(kind==='medium'?14:kind==='selection'?5:8);
    else $('#iosHaptic')?.click();
  }catch{}
}

function syncViewport(){
  const vv=window.visualViewport;
  const w=Math.max(1,Math.round(vv?.width||window.innerWidth));
  const h=Math.max(1,Math.round(vv?.height||window.innerHeight));
  const ox=Math.round(vv?.offsetLeft||0), oy=Math.round(vv?.offsetTop||0);
  document.documentElement.style.setProperty('--viewport-w',w+'px');
  document.documentElement.style.setProperty('--viewport-h',h+'px');
  $('#viewport').style.transform=`translate(${ox}px,${oy}px)`;
  requestAnimationFrame(()=>{
    const rect=stageWrap.getBoundingClientRect();
    const scale=Math.max(.1,Math.min(rect.width/DESIGN_W,rect.height/DESIGN_H));
    stage.style.transform=`scale(${scale})`;
  });
}

function createVoice(index){
  const amp=audio.createGain();
  const filter=audio.createBiquadFilter();
  const tri=audio.createOscillator();
  const overtone=audio.createOscillator();
  const sawA=audio.createOscillator();
  const sawB=audio.createOscillator();
  const triGain=audio.createGain();
  const overtoneGain=audio.createGain();
  const sawAGain=audio.createGain();
  const sawBGain=audio.createGain();

  tri.type='triangle'; overtone.type='sine'; sawA.type='sawtooth'; sawB.type='sawtooth';
  sawA.detune.value=-7; sawB.detune.value=7;
  filter.type='lowpass'; filter.Q.value=.72; filter.frequency.value=2300;
  amp.gain.value=0.00001;

  tri.connect(triGain); overtone.connect(overtoneGain); sawA.connect(sawAGain); sawB.connect(sawBGain);
  triGain.connect(filter); overtoneGain.connect(filter); sawAGain.connect(filter); sawBGain.connect(filter);
  filter.connect(amp); amp.connect(master);

  tri.start(); overtone.start(); sawA.start(); sawB.start();
  return {index,amp,filter,tri,overtone,sawA,sawB,triGain,overtoneGain,sawAGain,sawBGain};
}

function applyTimbre(immediate=false){
  const warm=soundMode==='warm';
  $('#soundBtn').textContent=warm?'WARM':'SYNTH';
  $('#soundBtn').classList.toggle('synth',!warm);
  statusSound.textContent=warm?'Warm':'Synth';
  if(!audio)return;
  const now=audio.currentTime, end=now+(immediate ? .001 : .07);
  for(const v of voicePool){
    const settings=[
      [v.triGain.gain,warm ? .86 : .08],
      [v.overtoneGain.gain,warm ? .11 : .025],
      [v.sawAGain.gain,warm?0:.38],
      [v.sawBGain.gain,warm?0:.38]
    ];
    for(const [p,target] of settings){holdParam(p,now);p.linearRampToValueAtTime(target,end)}
    holdParam(v.filter.frequency,now);v.filter.frequency.linearRampToValueAtTime(warm ? 2300 : 1450,end);
    holdParam(v.filter.Q,now);v.filter.Q.linearRampToValueAtTime(warm ? .72 : 2.4,end);
  }
}

function initAudio(){
  if(!audio){
    audio=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
    master=audio.createGain();
    compressor=audio.createDynamicsCompressor();
    compressor.threshold.value=-14; compressor.knee.value=18; compressor.ratio.value=2.2;
    compressor.attack.value=.012; compressor.release.value=.22;
    master.gain.value=Number(localStorage.getItem('hc-volume')||volume.value);
    volume.value=master.gain.value;
    master.connect(compressor); compressor.connect(audio.destination);
    voicePool=Array.from({length:VOICE_COUNT},(_,i)=>createVoice(i));
    applyTimbre(true);
  }
  if(audio.state==='suspended') audio.resume();
}

function silenceAll(duration=.035){
  if(!audio)return;
  const now=audio.currentTime;
  for(const v of voicePool){
    holdParam(v.amp.gain,now);
    v.amp.gain.linearRampToValueAtTime(.00001,now+duration);
  }
}

function intervalsFor(baseQuality,mod){
  let q=baseQuality;
  if(mod==='flip')q=baseQuality==='maj'?'min':'maj';
  if(mod==='dim')q='dim';
  if(mod==='aug')q='aug';
  const triad={maj:[0,4,7],min:[0,3,7],dim:[0,3,6],aug:[0,4,8]}[q]||[0,4,7];
  if(mod==='dom7')return [0,4,7,10];
  if(mod==='maj7')return q==='min'?[0,3,7,11]:[0,4,7,11];
  if(mod==='nine')return q==='min'?[0,3,7,10,14]:[0,4,7,10,14];
  if(mod==='sus4')return [0,5,7];
  if(mod==='sweet')return q==='min'?[0,3,7,9]:[0,4,7,9];
  return triad;
}

function chordLabel(root,q,mod){
  const n=NOTE_NAMES[root];
  if(mod==='flip')return n+(q==='maj'?'m':'');
  if(mod==='dom7')return n+'7';
  if(mod==='maj7')return n+(q==='min'?'mMaj7':'maj7');
  if(mod==='nine')return n+(q==='min'?'m9':'9');
  if(mod==='sus4')return n+'sus4';
  if(mod==='sweet')return n+(q==='min'?'m6':'6');
  if(mod==='dim')return n+'dim';
  if(mod==='aug')return n+'aug';
  return n+(q==='min'?'m':q==='dim'?'dim':'');
}

function playChord(){
  initAudio();
  const root=(keyIndex+MAJOR[selectedDegree])%12;
  const quality=QUALITIES[selectedDegree];
  const intervals=intervalsFor(quality,currentMod);
  const base=48+keyIndex+MAJOR[selectedDegree];
  const midi=intervals.map((n,i)=>base+n+(i===0?-12:0)).slice(0,VOICE_COUNT);
  const now=audio.currentTime;
  const quietAt=now+.032;
  const retuneAt=quietAt+.003;

  for(const v of voicePool){
    holdParam(v.amp.gain,now);
    v.amp.gain.linearRampToValueAtTime(.00001,quietAt);
  }

  voicePool.forEach((v,i)=>{
    if(i>=midi.length){
      v.amp.gain.setValueAtTime(.00001,retuneAt);
      return;
    }
    const freq=440*Math.pow(2,(midi[i]-69)/12);
    for(const param of [v.tri.frequency,v.overtone.frequency,v.sawA.frequency,v.sawB.frequency]){
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value,now);
    }
    v.tri.frequency.setValueAtTime(freq,retuneAt);
    v.overtone.frequency.setValueAtTime(freq*2,retuneAt);
    v.sawA.frequency.setValueAtTime(freq,retuneAt);
    v.sawB.frequency.setValueAtTime(freq,retuneAt);
    const onset=retuneAt+(strum?i*.046:0);
    const peak=(soundMode==='warm' ? .115 : .078)/(1+i*.07);
    v.amp.gain.setValueAtTime(.00001,onset);
    v.amp.gain.linearRampToValueAtTime(peak,onset+.042);
    if(!hold){
      v.amp.gain.setValueAtTime(peak,onset+.72);
      v.amp.gain.exponentialRampToValueAtTime(.00001,onset+1.75);
    }
  });

  const label=chordLabel(root,quality,currentMod);
  display.textContent=label; statusChord.textContent=label; statusMod.textContent=MOD_NAMES[currentMod];
  document.querySelectorAll('.pad').forEach(p=>p.classList.toggle('selected',Number(p.dataset.degree)===selectedDegree));
}

function chooseDegree(degree){
  selectedDegree=degree;
  localStorage.setItem('hc-degree',degree);
  playChord();
}

function modifierFromVector(x,y){
  const mag=Math.hypot(x,y);
  if(mag<.24)return 'base';
  const angle=Math.atan2(y,x)*180/Math.PI;
  const dirs=[['maj7',0],['nine',45],['sus4',90],['sweet',135],['dim',180],['aug',-135],['flip',-90],['dom7',-45]];
  let best='base',distance=999;
  for(const [name,target] of dirs){
    const d=Math.abs((((angle-target)+180)%360+360)%360-180);
    if(d<distance){distance=d;best=name}
  }
  return best;
}

function updateJoy(clientX,clientY){
  const r=joyArea.getBoundingClientRect();
  let x=(clientX-(r.left+r.width/2))/(r.width/2);
  let y=(clientY-(r.top+r.height/2))/(r.height/2);
  const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag}
  joyStick.style.transform=`translate(${x*43}%,${y*43}%)`;
  const next=modifierFromVector(x,y);
  if(next!==currentMod){
    currentMod=next;
    if(next!==lastJoyHaptic){haptic('selection');lastJoyHaptic=next}
    playChord();
  }
}

function centerJoystick(replay=true){
  joyTouchId=null;joyMouseDown=false;orphanedJoy=false;lastJoyHaptic='base';
  joyStick.classList.remove('dragging');
  joyStick.style.transform='translate(0,0)';
  if(currentMod!=='base'){
    currentMod='base';
    if(replay)playChord();
  }
}

joyArea.addEventListener('touchstart',e=>{
  if(joyTouchId!==null)return;
  const t=e.changedTouches[0];
  joyTouchId=t.identifier;orphanedJoy=false;joyStick.classList.add('dragging');
  haptic('selection');updateJoy(t.clientX,t.clientY);e.preventDefault();
},{passive:false});
joyArea.addEventListener('touchmove',e=>{
  const t=Array.from(e.touches).find(t=>t.identifier===joyTouchId);
  if(t){updateJoy(t.clientX,t.clientY);e.preventDefault()}
},{passive:false});
joyArea.addEventListener('touchend',e=>{
  if(Array.from(e.changedTouches).some(t=>t.identifier===joyTouchId)){centerJoystick(true);e.preventDefault()}
},{passive:false});
joyArea.addEventListener('touchcancel',e=>{
  if(Array.from(e.changedTouches).some(t=>t.identifier===joyTouchId)){
    joyTouchId=null;orphanedJoy=true;joyStick.classList.remove('dragging');
  }
},{passive:false});

joyArea.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch')return;
  joyMouseDown=true;joyStick.classList.add('dragging');haptic('selection');updateJoy(e.clientX,e.clientY);e.preventDefault();
});
window.addEventListener('pointermove',e=>{if(joyMouseDown)updateJoy(e.clientX,e.clientY)});
window.addEventListener('pointerup',()=>{if(joyMouseDown)centerJoystick(true)});

function bindPress(element,action,hapticKind='light'){
  let touchActive=false;
  element.addEventListener('touchstart',e=>{
    touchActive=true;element.classList.add('pressed','down');haptic(hapticKind);action();e.preventDefault();
  },{passive:false});
  element.addEventListener('touchend',e=>{touchActive=false;element.classList.remove('pressed','down');e.preventDefault()},{passive:false});
  element.addEventListener('touchcancel',()=>{touchActive=false;element.classList.remove('pressed','down')},{passive:false});
  element.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||touchActive)return;
    element.classList.add('pressed','down');haptic(hapticKind);action();e.preventDefault();
  });
  const release=()=>element.classList.remove('pressed','down');
  element.addEventListener('pointerup',release);element.addEventListener('pointercancel',release);element.addEventListener('pointerleave',release);
}

document.querySelectorAll('.pad').forEach(p=>bindPress(p,()=>chooseDegree(Number(p.dataset.degree)),'medium'));
bindPress($('#keyBtn'),()=>{keyIndex=(keyIndex+1)%12;localStorage.setItem('hc-key',keyIndex);playChord()},'light');
bindPress($('#strumBtn'),()=>{strum=!strum;localStorage.setItem('hc-strum',strum?'1':'0');$('#strumBtn').classList.toggle('active',strum);playChord()},'light');
bindPress($('#holdBtn'),()=>{hold=!hold;localStorage.setItem('hc-hold',hold?'1':'0');$('#holdBtn').classList.toggle('active',hold);playChord()},'medium');
bindPress($('#soundBtn'),()=>{soundMode=soundMode==='warm'?'synth':'warm';localStorage.setItem('hc-sound',soundMode);applyTimbre(false);playChord()},'medium');

volume.addEventListener('input',()=>{initAudio();holdParam(master.gain,audio.currentTime);master.gain.linearRampToValueAtTime(Number(volume.value),audio.currentTime+.035);localStorage.setItem('hc-volume',volume.value)});

$('#startBtn').addEventListener('click',async()=>{initAudio();await audio.resume();haptic('medium');startOverlay.classList.add('hidden');playChord()});
$('#installBtn').addEventListener('click',()=>installHelp.classList.add('show'));
$('#closeHelp').addEventListener('click',()=>installHelp.classList.remove('show'));

const standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
if(standalone)$('#installBtn').style.display='none';
$('#strumBtn').classList.toggle('active',strum);$('#holdBtn').classList.toggle('active',hold);applyTimbre(true);
document.querySelectorAll('.pad').forEach(p=>p.classList.toggle('selected',Number(p.dataset.degree)===selectedDegree));

['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,e=>e.preventDefault(),{passive:false}));
let lastTouchEnd=0;document.addEventListener('touchend',e=>{const now=Date.now();if(now-lastTouchEnd<320)e.preventDefault();lastTouchEnd=now},{passive:false});

document.addEventListener('visibilitychange',()=>{if(document.hidden){silenceAll(.025);centerJoystick(false)}});
window.addEventListener('blur',()=>{silenceAll(.025);centerJoystick(false)});
window.addEventListener('resize',syncViewport);window.addEventListener('orientationchange',()=>setTimeout(syncViewport,80));
window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);
syncViewport();

if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{}))}
})();
