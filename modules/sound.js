const Sound = (() => {
  let actx = null;
  function getCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone({ freq=440, type='square', vol=0.3, duration=0.12, freqEnd=null, attack=0.005 }={}) {
    try {
      const ac=getCtx(), osc=ac.createOscillator(), gain=ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type=type; osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime+duration);
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ac.currentTime+attack);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+duration);
      osc.start(ac.currentTime); osc.stop(ac.currentTime+duration+0.02);
    } catch(_) {}
  }
  function noise({ vol=0.2, duration=0.15 }={}) {
    try {
      const ac=getCtx(), buf=ac.createBuffer(1,Math.floor(ac.sampleRate*duration),ac.sampleRate);
      const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
      const src=ac.createBufferSource(), gain=ac.createGain();
      src.buffer=buf; src.connect(gain); gain.connect(ac.destination);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime+duration);
      src.start();
    } catch(_) {}
  }

  // ── BGM — MP3 파일 기반 ──────────────────────────
  let bgmAudio = null;
  let gameoverAudio = null;
  let stageclearAudio = null;

  function preloadSfx() {
    gameoverAudio = new Audio('docs/gameover.mp3');
    gameoverAudio.volume = 0.5;
    gameoverAudio.load();
    stageclearAudio = new Audio('docs/stageclear.mp3');
    stageclearAudio.volume = 0.5;
    stageclearAudio.load();
  }

  function unlockSfx() {
    // iOS에서 첫 터치 때 무음 재생으로 언락
    [gameoverAudio, stageclearAudio].forEach(a => {
      if (!a) return;
      const prevVol = a.volume;
      a.volume = 0;
      a.play().then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = prevVol;
      }).catch(() => {});
    });
    // AudioContext도 같이 언락
    getCtx();
  }

  function bgmStart() {
    if (bgmAudio) return;
    bgmAudio = new Audio('docs/bgm.mp3');
    bgmAudio.loop = true;
    bgmAudio.volume = 0.35;
    bgmAudio.play().catch(() => {});
  }
  function bgmStop() {
    if (!bgmAudio) return;
    bgmAudio.pause();
    bgmAudio.currentTime = 0;
    bgmAudio = null;
  }

  return {
    shoot()      { tone({freq:880,freqEnd:220,type:'square',vol:0.18,duration:0.10}); },
    tick()       { tone({freq:660,type:'sine',vol:0.12,duration:0.06,attack:0.002}); },
    correct()    { tone({freq:523,type:'sine',vol:0.3,duration:0.12}); setTimeout(()=>tone({freq:659,type:'sine',vol:0.3,duration:0.12}),100); setTimeout(()=>tone({freq:784,type:'sine',vol:0.35,duration:0.2}),200); },
    wrong()      { noise({vol:0.15,duration:0.08}); tone({freq:200,freqEnd:80,type:'sawtooth',vol:0.25,duration:0.25}); },
    miss()       { noise({vol:0.2,duration:0.12}); tone({freq:120,type:'sine',vol:0.3,duration:0.3}); },
    lifeLost()   { [0,130,260].forEach(d=>setTimeout(()=>tone({freq:330,freqEnd:110,type:'square',vol:0.25,duration:0.18}),d)); },
    gameOver() {
      bgmStop();
      if (gameoverAudio) {
        gameoverAudio.currentTime = 0;
        gameoverAudio.volume = 0.45;
        gameoverAudio.play().catch(() => {});
      }
    },
    stageClear() {
      bgmStop();
      if (stageclearAudio) {
        stageclearAudio.currentTime = 0;
        stageclearAudio.volume = 0.5;
        stageclearAudio.play().catch(() => {});
      }
    },
    levelUp()    { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone({freq:f,type:'square',vol:0.2,duration:0.18}),i*90)); },
    start()      { bgmStart(); [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone({freq:f,type:'sine',vol:0.25,duration:0.15}),i*80)); },
    bonusHit()   { noise({vol:0.25,duration:0.12}); tone({freq:440,freqEnd:880,type:'sine',vol:0.3,duration:0.15}); setTimeout(()=>tone({freq:660,type:'sine',vol:0.25,duration:0.12}),80); },
    bonusHeart() { [523,784,1047,1319].forEach((f,i)=>setTimeout(()=>tone({freq:f,type:'sine',vol:0.3,duration:0.15}),i*70)); },
    unlockSfx, preloadSfx, bgmStart, bgmStop,
  };
})();

export default Sound;