/* ============================================
   STUDY INVADERS — game.js
   ============================================ */
'use strict';

const STATE = {
  MENU: 'MENU', READING: 'READING', PLAYING: 'PLAYING',
  MODAL: 'MODAL', GAMEOVER: 'GAMEOVER',
};

const CONFIG = {
  lives: 3,
  baseEnemySpeed: 55,
  speedScalePerN: 5,
  speedScaleAmount: 0.12,
  shipSpeed: 380,
  missileSpeed: 520,
  fireCooldown: 280,
  maxMissiles: 5,
  enemyPadding: 60,
  starCount: 120,
  feedbackDuration: 1800,
  readDuration: 3.0,
};

// ============================================
// GOOGLE SHEETS LEADERBOARD
// ============================================
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwZsWqqm_fUERO2BfQUSmfaOQfdeRrH7ZOu6EeXgjGBXTMIVm_td3h3GxTPMsHKvOZTHw/exec';

async function lbSubmit(name, score, questionSet) {
  try {
    const url = SHEETS_URL
      + "?action=submit"
      + "&name=" + encodeURIComponent(name)
      + "&score=" + encodeURIComponent(score)
      + "&questionSet=" + encodeURIComponent(questionSet || "unknown");
    await fetch(url);
  } catch (e) { console.warn("Score submit failed:", e); }
}

async function lbFetch() {
  try {
    const res = await fetch(SHEETS_URL + "?action=leaderboard&t=" + Date.now());
    return await res.json();
  } catch (e) { console.warn("Leaderboard fetch failed:", e); return []; }
}

function lbRender(highlightName, entries) {
  const list = document.getElementById('lb-list');
  if (!list) return;
  if (!entries || entries.length === 0) {
    list.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>';
    return;
  }
  const medals = ['gold', 'silver', 'bronze'];
  list.innerHTML = entries.map((e, i) => {
    const hi = e.name === highlightName ? ' highlight' : '';
    return `<div class="lb-row${hi}">
      <span class="lb-rank ${medals[i] || ''}">${i + 1}.</span>
      <span class="lb-name">${e.name}</span>
      <span class="lb-score">${e.score}</span>
    </div>`;
  }).join('');
}

// ============================================
// SOUND ENGINE
// ============================================
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
  return {
    shoot()   { tone({freq:880,freqEnd:220,type:'square',vol:0.18,duration:0.10}); },
    tick()    { tone({freq:660,type:'sine',vol:0.12,duration:0.06,attack:0.002}); },
    correct() { tone({freq:523,type:'sine',vol:0.3,duration:0.12}); setTimeout(()=>tone({freq:659,type:'sine',vol:0.3,duration:0.12}),100); setTimeout(()=>tone({freq:784,type:'sine',vol:0.35,duration:0.2}),200); },
    wrong()   { noise({vol:0.15,duration:0.08}); tone({freq:200,freqEnd:80,type:'sawtooth',vol:0.25,duration:0.25}); },
    miss()    { noise({vol:0.2,duration:0.12}); tone({freq:120,type:'sine',vol:0.3,duration:0.3}); },
    lifeLost(){ [0,130,260].forEach(d=>setTimeout(()=>tone({freq:330,freqEnd:110,type:'square',vol:0.25,duration:0.18}),d)); },
    gameOver(){ tone({freq:392,freqEnd:49,type:'sawtooth',vol:0.3,duration:0.9}); setTimeout(()=>noise({vol:0.1,duration:0.5}),200); },
    levelUp() { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone({freq:f,type:'square',vol:0.2,duration:0.18}),i*90)); },
    start()   { [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone({freq:f,type:'sine',vol:0.25,duration:0.15}),i*80)); },
  };
})();

// ============================================
// RUNTIME STATE
// ============================================
let state='MENU', questions=[], qIndex=0, score=0, lives=CONFIG.lives;
let correctCount=0, enemySpeed=CONFIG.baseEnemySpeed;
let lastTime=0, animId=null, fireCooldown=0, inputFrozen=false;
let readTimer=0, prevReadSec=0, currentPlayer='', currentSetName='Sample';
let ship={}, missiles=[], enemies=[], stars=[];
const keys={};

// DOM refs (set in DOMContentLoaded)
let canvas, ctx, uiScore, uiLevel, uiLives, uiQNum,
    questionText, feedbackBanner, quitModal, finalScoreEl, loadedLabel;

// ============================================
// SCREEN
// ============================================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name)?.classList.add('active');
  quitModal.classList.add('hidden');
}

// ============================================
// CANVAS
// ============================================
function resizeCanvas() {
  const g=document.getElementById('screen-game');
  canvas.width=g.clientWidth;
  canvas.height=g.clientHeight
    - document.getElementById('game-ui').offsetHeight
    - document.getElementById('question-bar').offsetHeight;
  if (ship.x!==undefined)
    ship.x=Math.max(ship.width/2, Math.min(canvas.width-ship.width/2, ship.x));
}

// ============================================
// STARS
// ============================================
function initStars() {
  stars=Array.from({length:CONFIG.starCount},()=>({
    x:Math.random()*canvas.width, y:Math.random()*canvas.height,
    r:Math.random()*1.5+0.3, speed:Math.random()*30+10, alpha:Math.random()*0.6+0.2,
  }));
}
function updateStars(dt) { stars.forEach(s=>{ s.y+=s.speed*dt; if(s.y>canvas.height){s.y=0;s.x=Math.random()*canvas.width;} }); }
function drawStars() {
  stars.forEach(s=>{ ctx.save(); ctx.globalAlpha=s.alpha; ctx.fillStyle='#c8e8ff'; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fill(); ctx.restore(); });
}

// ============================================
// SHIP
// ============================================
function initShip() { ship={x:canvas.width/2,y:canvas.height-60,width:44,height:44,speed:CONFIG.shipSpeed}; }
function updateShip(dt) {
  if(inputFrozen) return;
  if(keys['ArrowLeft'])  ship.x-=ship.speed*dt;
  if(keys['ArrowRight']) ship.x+=ship.speed*dt;
  ship.x=Math.max(ship.width/2, Math.min(canvas.width-ship.width/2, ship.x));
}
function drawShip() {
  const {x,y,width:w,height:h}=ship;
  ctx.save(); ctx.shadowColor='#00f5ff'; ctx.shadowBlur=18; ctx.fillStyle='#00d4e8';
  ctx.beginPath(); ctx.moveTo(x,y-h/2); ctx.lineTo(x-w/2,y+h/2); ctx.lineTo(x-w*0.15,y+h*0.2); ctx.lineTo(x,y+h*0.35); ctx.lineTo(x+w*0.15,y+h*0.2); ctx.lineTo(x+w/2,y+h/2); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#ff2d6b';
  [[x-w*0.1,y+h*0.1,x-w/2,y+h/2,x-w*0.15,y+h*0.2],[x+w*0.1,y+h*0.1,x+w/2,y+h/2,x+w*0.15,y+h*0.2]].forEach(([x1,y1,x2,y2,x3,y3])=>{ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill(); });
  ctx.fillStyle='rgba(200,240,255,0.85)'; ctx.beginPath(); ctx.ellipse(x,y-h*0.05,w*0.12,h*0.2,0,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ============================================
// MISSILES
// ============================================
function fireMissile() {
  if(inputFrozen||fireCooldown>0) return;
  if(missiles.filter(m=>m.active).length>=CONFIG.maxMissiles) return;
  missiles.push({x:ship.x,y:ship.y-ship.height/2,width:4,height:18,vy:-CONFIG.missileSpeed,active:true});
  fireCooldown=CONFIG.fireCooldown; Sound.shoot();
}
function updateMissiles(dt) {
  missiles.forEach(m=>{ if(m.active){m.y+=m.vy*dt; if(m.y<0)m.active=false;} });
  missiles=missiles.filter(m=>m.active);
}
function drawMissiles() {
  missiles.forEach(m=>{ if(!m.active)return; ctx.save(); ctx.shadowColor='#00f5ff'; ctx.shadowBlur=10; const g=ctx.createLinearGradient(m.x,m.y,m.x,m.y+m.height); g.addColorStop(0,'#fff'); g.addColorStop(0.4,'#00f5ff'); g.addColorStop(1,'rgba(0,245,255,0)'); ctx.fillStyle=g; ctx.fillRect(m.x-m.width/2,m.y,m.width,m.height); ctx.restore(); });
}

// ============================================
// ENEMIES
// ============================================
function spawnEnemies() {
  const q=questions[qIndex]; if(!q)return; enemies=[];
  const count=q.choices.length, pad=CONFIG.enemyPadding;
  const eW=Math.min(180,(canvas.width-pad*2)/count-20), eH=52, slotW=(canvas.width-pad*2)/count;
  q.choices.forEach((choice,i)=>{ enemies.push({ x:pad+slotW*i+slotW/2+(Math.random()-0.5)*slotW*0.3, y:-eH-Math.random()*60-i*30, width:eW,height:eH,choiceText:choice,choiceIndex:i, active:true,vy:enemySpeed,shimmer:Math.random()*Math.PI*2,flashCorrect:false }); });
}
function updateEnemies(dt) {
  let bottom=false;
  enemies.forEach(e=>{ if(!e.active)return; e.y+=e.vy*dt; e.shimmer+=dt*2; if(e.y-e.height/2>canvas.height){e.active=false;bottom=true;} });
  if(bottom&&!inputFrozen){Sound.miss();loseLife('miss');}
}
function drawEnemies() {
  enemies.forEach(e=>{ if(!e.active)return; ctx.save(); ctx.shadowColor=e.flashCorrect?'#39ff14':'#8888cc'; ctx.shadowBlur=14*(0.4+0.2*Math.sin(e.shimmer)); ctx.fillStyle=e.flashCorrect?'rgba(0,40,10,0.9)':'rgba(10,10,40,0.9)'; rrect(ctx,e.x-e.width/2,e.y-e.height/2,e.width,e.height,8); ctx.fill(); ctx.strokeStyle=e.flashCorrect?'rgba(57,255,20,0.6)':'rgba(100,120,200,0.5)'; ctx.lineWidth=1.5; rrect(ctx,e.x-e.width/2,e.y-e.height/2,e.width,e.height,8); ctx.stroke(); ctx.fillStyle=e.flashCorrect?'#39ff14':'#6688cc'; ctx.font='bold 11px Orbitron,monospace'; ctx.textAlign='center'; ctx.fillText(String.fromCharCode(65+e.choiceIndex),e.x,e.y-e.height/2+14); ctx.fillStyle='#ddeeff'; wrapText(ctx,e.choiceText,e.x,e.y,e.width-16); ctx.restore(); });
}

// ============================================
// UTILS
// ============================================
function rrect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); c.closePath(); }
function wrapText(c,text,cx,cy,maxW){ const words=text.split(' '),lh=14,fs=Math.min(13,Math.floor(maxW/(text.length*0.55))+6); c.font=`${fs}px Orbitron,monospace`; c.textAlign='center'; let lines=[],line=''; words.forEach(w=>{const t=line?line+' '+w:w; if(c.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}); if(line)lines.push(line); const sy=cy-(lines.length*lh)/2+lh/2; lines.forEach((l,i)=>c.fillText(l,cx,sy+i*lh)); }
function wrapTextCard(c,text,cx,startY,maxW,lh){ const words=text.split(' '); let lines=[],line=''; words.forEach(w=>{const t=line?line+' '+w:w; if(c.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}); if(line)lines.push(line); const totalH=lines.length*lh; lines.forEach((l,i)=>c.fillText(l,cx,startY-totalH/2+i*lh+lh)); }

// ============================================
// COLLISION
// ============================================
function checkCollisions() {
  missiles.forEach(m=>{ if(!m.active)return; enemies.forEach(e=>{ if(!e.active)return; if(m.x>e.x-e.width/2&&m.x<e.x+e.width/2&&m.y>e.y-e.height/2&&m.y<e.y+e.height/2){m.active=false;e.active=false;handleHit(e.choiceIndex);} }); });
}

// ============================================
// HIT / LIFE
// ============================================
function handleHit(choiceIndex) {
  const q=questions[qIndex];
  if(choiceIndex===q.answerIndex){
    const hit=enemies.find(e=>e.choiceIndex===q.answerIndex); if(hit)hit.flashCorrect=true;
    score+=10+Math.max(0,lives)*2; correctCount++;
    if(correctCount%CONFIG.speedScalePerN===0){enemySpeed*=(1+CONFIG.speedScaleAmount);Sound.levelUp();}else Sound.correct();
    showFeedback(true,q.explain||'');
  } else { Sound.wrong(); loseLife('wrong'); }
}
function loseLife(reason) {
  if(inputFrozen)return; lives=Math.max(0,lives-1); updateHUD();
  if(lives<=0){endGame();return;} Sound.lifeLost();
  if(reason==='wrong') showFeedback(false,'');
  else { inputFrozen=true; setTimeout(()=>{inputFrozen=false;spawnEnemies();},800); }
}

// ============================================
// FEEDBACK
// ============================================
function showFeedback(correct,explain) {
  inputFrozen=true;
  feedbackBanner.className='feedback '+(correct?'correct':'wrong');
  feedbackBanner.innerHTML=`<span class="fb-icon">${correct?'✅ CORRECT!':'❌ WRONG!'}</span>`+(explain?`<span class="fb-explain">${explain}</span>`:'');
  feedbackBanner.classList.remove('hidden');
  setTimeout(()=>{ feedbackBanner.classList.add('hidden'); inputFrozen=false; if(correct)advanceQuestion();else spawnEnemies(); },CONFIG.feedbackDuration);
}

// ============================================
// QUESTION FLOW
// ============================================
function advanceQuestion() { qIndex++; missiles=[]; if(qIndex>=questions.length){endGame(true);return;} loadQuestion(); }
function loadQuestion() { questionText.textContent=questions[qIndex].prompt; updateHUD(); missiles=[];enemies=[]; readTimer=CONFIG.readDuration; prevReadSec=Math.ceil(readTimer); state=STATE.READING; }
function startEnemyPhase() { state=STATE.PLAYING; lastTime=performance.now(); spawnEnemies(); }

// ============================================
// HUD
// ============================================
function updateHUD() {
  uiScore.textContent='SCORE: '+score;
  uiLives.textContent='♥ '.repeat(lives).trim()||'💀';
  uiQNum.textContent=`Q ${qIndex+1} / ${questions.length}`;
  uiLevel.textContent = '⚡x' + (Math.floor(correctCount / CONFIG.speedScalePerN) + 1);
  const n=document.getElementById('ui-player-name'); if(n)n.textContent=currentPlayer?currentPlayer.toUpperCase():'';
}

// ============================================
// QUESTION CARD
// ============================================
function drawQuestionCard() {
  const q=questions[qIndex];
  const w=Math.min(canvas.width*0.82,720),h=Math.min(canvas.height*0.55,300);
  const cx=canvas.width/2,cy=canvas.height/2,x=cx-w/2,y=cy-h/2;
  ctx.save(); ctx.shadowColor='#00f5ff'; ctx.shadowBlur=40; ctx.fillStyle='rgba(0,15,40,0.97)'; rrect(ctx,x,y,w,h,16); ctx.fill();
  ctx.shadowBlur=0; ctx.strokeStyle='#00f5ff'; ctx.lineWidth=2; rrect(ctx,x,y,w,h,16); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.font='bold 11px "Press Start 2P",monospace'; ctx.fillStyle='#00f5ff'; ctx.textAlign='center';
  ctx.fillText(`QUESTION ${qIndex+1} / ${questions.length}`,cx,y+28);
  ctx.strokeStyle='rgba(0,245,255,0.2)'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x+24,y+40); ctx.lineTo(x+w-24,y+40); ctx.stroke();
  ctx.fillStyle='#ffffff'; const fs=Math.max(13,Math.min(17,Math.floor(w/(q.prompt.length*0.55))+8)); ctx.font=`${fs}px Orbitron,monospace`;
  wrapTextCard(ctx,q.prompt,cx,cy-10,w-60,24);
  ctx.font='10px "Press Start 2P",monospace'; ctx.fillStyle='rgba(0,245,255,0.5)'; ctx.fillText('SPACE to skip',cx,y+h-18); ctx.restore();
  const bw=w-60,bh=6,bx=x+30,by=y+h-36,prog=Math.max(0,readTimer/CONFIG.readDuration);
  const rv=Math.floor(255*(1-prog)),gv=Math.floor(255*prog);
  ctx.save(); ctx.fillStyle='rgba(0,245,255,0.15)'; rrect(ctx,bx,by,bw,bh,3); ctx.fill();
  if(bw*prog>0){ctx.fillStyle=`rgb(${rv},${gv},80)`;ctx.shadowColor=`rgb(${rv},${gv},80)`;ctx.shadowBlur=8;rrect(ctx,bx,by,bw*prog,bh,3);ctx.fill();}
  ctx.font='bold 13px "Press Start 2P",monospace'; ctx.fillStyle=`rgb(${rv},${gv},80)`; ctx.shadowBlur=12; ctx.textAlign='right';
  ctx.fillText(Math.ceil(readTimer)+'s',bx+bw,by-6); ctx.restore();
}

// ============================================
// GAME OVER — submit + fetch leaderboard
// ============================================
async function endGame(win=false) {
  state=STATE.GAMEOVER;
  cancelAnimationFrame(animId);
  Sound.gameOver();

  const hasNextLevel = levelQueue.length > 0 && levelIndex + 1 < levelQueue.length;

  // Won and next level exists → ask to continue
  if (win && hasNextLevel) {
    showNextLevelPrompt();
    return;
  }

  // No next level or game over → show leaderboard
  finalScoreEl.textContent = score;
  const t = document.getElementById('over-title');
  if (win && levelQueue.length > 0) {
    t.textContent = '🎓 COURSE COMPLETE!';
    t.style.color = 'var(--clr-green)';
  } else {
    t.textContent = win ? '🎉 COMPLETE!' : 'GAME OVER';
    t.style.color = win ? 'var(--clr-green)' : 'var(--clr-accent)';
  }
  showScreen('gameover');
  await saveAndShowLeaderboard();
}

async function saveAndShowLeaderboard() {
  const list = document.getElementById('lb-list');
  if (list) list.innerHTML = '<div class="lb-empty"><div class="spinner"></div></div>';
  if (currentPlayer) await lbSubmit(currentPlayer, score, currentSetName);
  await new Promise(r => setTimeout(r, 1200));
  const entries = await lbFetch();
  lbRender(currentPlayer, entries);
}

function showNextLevelPrompt() {
  const overlay = document.createElement('div');
  overlay.id = 'modal-nextlevel';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,5,20,0.95);display:flex;align-items:center;justify-content:center;z-index:300;';
  overlay.innerHTML = `
    <div style="background:#040d1f;border:2px solid var(--clr-primary);border-radius:12px;padding:2.5rem 3rem;display:flex;flex-direction:column;align-items:center;gap:1.4rem;box-shadow:0 0 40px rgba(0,245,255,0.2);animation:popIn 0.2s ease;">
      <div style="font-family:'Press Start 2P',monospace;font-size:clamp(0.6rem,1.8vw,0.9rem);color:#39ff14;text-shadow:0 0 16px #39ff14;letter-spacing:0.1em;">✅ STAGE CLEAR!</div>
      <div style="font-family:'Press Start 2P',monospace;font-size:clamp(0.45rem,1.2vw,0.65rem);color:var(--clr-primary);letter-spacing:0.08em;">LEVEL ${levelIndex + 2} IS READY</div>
      <div style="font-family:'Orbitron',monospace;font-size:0.9rem;color:var(--clr-text);">Continue to the next level?</div>
      <div style="font-family:'Press Start 2P',monospace;font-size:0.4rem;color:var(--clr-gold);">SCORE: ${score}</div>
      <div style="display:flex;gap:1rem;margin-top:0.3rem;">
        <button id="btn-next-yes" style="font-family:'Press Start 2P',monospace;font-size:0.5rem;background:var(--clr-primary);color:#000;border:none;padding:0.9rem 1.5rem;cursor:pointer;border-radius:6px;letter-spacing:0.08em;box-shadow:0 0 16px rgba(0,245,255,0.4);">▶ CONTINUE</button>
        <button id="btn-next-no"  style="font-family:'Press Start 2P',monospace;font-size:0.5rem;background:transparent;color:var(--clr-text);border:2px solid var(--clr-dim);padding:0.9rem 1.5rem;cursor:pointer;border-radius:6px;letter-spacing:0.08em;">✕ FINISH</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('btn-next-yes').addEventListener('click', async () => {
    overlay.remove();
    levelIndex++;
    await loadLevelByIndex(levelIndex, true);
  });

  document.getElementById('btn-next-no').addEventListener('click', async () => {
    overlay.remove();
    finalScoreEl.textContent = score;
    const t = document.getElementById('over-title');
    t.textContent = '🎉 STAGE CLEAR!';
    t.style.color = 'var(--clr-green)';
    showScreen('gameover');
    await saveAndShowLeaderboard();
  });
}

// ============================================
// MAIN LOOP
// ============================================
function loop(ts) {
  if(state!==STATE.PLAYING&&state!==STATE.READING)return;
  const dt=Math.min((ts-lastTime)/1000,0.05); lastTime=ts;
  if(state===STATE.READING){
    readTimer-=dt; const ns=Math.ceil(readTimer);
    if(ns<prevReadSec&&ns>0)Sound.tick(); prevReadSec=ns;
    updateStars(dt); ctx.clearRect(0,0,canvas.width,canvas.height); drawStars(); drawQuestionCard();
    if(readTimer<=0)startEnemyPhase();
    animId=requestAnimationFrame(loop); return;
  }
  fireCooldown=Math.max(0,fireCooldown-dt*1000);
  updateStars(dt);
  if(!inputFrozen){updateShip(dt);updateMissiles(dt);updateEnemies(dt);checkCollisions();}else updateMissiles(dt);
  ctx.clearRect(0,0,canvas.width,canvas.height); drawStars(); drawEnemies(); drawMissiles(); drawShip();
  animId=requestAnimationFrame(loop);
}

// ============================================
// USERNAME MODAL
// ============================================
function showUsernameModal() {
  const inp=document.getElementById('input-username');
  inp.value='';
  document.getElementById('modal-username').classList.remove('hidden');
  setTimeout(()=>inp.focus(),80);
}
function confirmUsername() {
  const name=document.getElementById('input-username').value.trim();
  if(!name)return;
  currentPlayer=name;
  document.getElementById('modal-username').classList.add('hidden');
  actuallyStartGame();
}

// ============================================
// START GAME
// ============================================
function startGame() {
  if(state===STATE.GAMEOVER&&currentPlayer){actuallyStartGame();return;}
  if(questions.length===0){loadDefaultQuestions().then(showUsernameModal);return;}
  showUsernameModal();
}
function actuallyStartGame() {
  if(questions.length===0){loadDefaultQuestions().then(actuallyStartGame);return;}
  qIndex=0;score=0;lives=CONFIG.lives;correctCount=0;
  enemySpeed=CONFIG.baseEnemySpeed;missiles=[];inputFrozen=false;fireCooldown=0;
  Sound.start();
  showScreen('game'); resizeCanvas(); initStars(); initShip(); updateHUD(); loadQuestion();
  lastTime=performance.now(); animId=requestAnimationFrame(loop);
}

// ============================================
// LOAD QUESTIONS
// ============================================
// async function loadDefaultQuestions() {
//   try {
//     const res=await fetch('questions/sample.json');
//     if(!res.ok)throw new Error('HTTP '+res.status);
//     const data=await res.json();
//     questions=data.questions;
//     currentSetName=data.title||'Sample';
//     if(loadedLabel)loadedLabel.textContent='✓ '+(data.title||'Default set loaded');
//   } catch(e) {
//     questions=[
//       {prompt:"What is 2+2?",choices:["3","4","5","6"],answerIndex:1,explain:"2+2=4!"},
//       {prompt:"Closest planet to the Sun?",choices:["Earth","Mars","Mercury","Venus"],answerIndex:2,explain:"Mercury."},
//       {prompt:"Chemical symbol for water?",choices:["O2","CO2","H2O","NaCl"],answerIndex:2,explain:"H₂O."},
//     ];
//     currentSetName='Fallback';
//     if(loadedLabel)loadedLabel.textContent='✓ Fallback set loaded';
//   }
// }

// ============================================
// QUIT MODAL
// ============================================
function openQuitModal() { if(state!==STATE.PLAYING&&state!==STATE.READING)return; state=STATE.MODAL; quitModal.classList.remove('hidden'); }
function closeQuitModal() { if(state!==STATE.MODAL)return; state=enemies.length===0?STATE.READING:STATE.PLAYING; quitModal.classList.add('hidden'); lastTime=performance.now(); animId=requestAnimationFrame(loop); }
function confirmQuit() { cancelAnimationFrame(animId); state=STATE.MENU; quitModal.classList.add('hidden'); showScreen('menu'); }

// ============================================
// KEYBOARD
// ============================================
document.addEventListener('keydown', e=>{
  keys[e.code]=true;
  // Username modal
  const um=document.getElementById('modal-username');
  if(um&&!um.classList.contains('hidden')){
    if(e.code==='Enter'){e.preventDefault();confirmUsername();}
    return;
  }
  if(e.code==='Space'){
    e.preventDefault();
    if(state===STATE.READING)readTimer=0;
    else if(state===STATE.PLAYING)fireMissile();
    else if(state===STATE.MENU)startGame();
  }
  if(e.code==='Escape'){
    if(state===STATE.PLAYING||state===STATE.READING)openQuitModal();
    else if(state===STATE.MODAL)closeQuitModal();
  }
  if(e.code==='Enter'){
    if(state===STATE.MENU)startGame();
    else if(state===STATE.MODAL)confirmQuit();
    else if(state===STATE.GAMEOVER)startGame();
  }
});
document.addEventListener('keyup', e=>{ keys[e.code]=false; });

// ============================================
// BOOT
// ============================================
document.addEventListener('DOMContentLoaded', ()=>{
  canvas       =document.getElementById('game-canvas');
  ctx          =canvas.getContext('2d');
  uiScore      =document.getElementById('ui-score');
  uiLevel      =document.getElementById('ui-level');
  uiLives      =document.getElementById('ui-lives');
  uiQNum       =document.getElementById('ui-question-num');
  questionText =document.getElementById('question-text');
  feedbackBanner=document.getElementById('feedback-banner');
  quitModal    =document.getElementById('modal-quit');
  finalScoreEl =document.getElementById('final-score');
  loadedLabel  =document.getElementById('loaded-set-name');

  // Buttons
  document.getElementById('btn-start').addEventListener('click', showSubjectScreen);
  document.getElementById('btn-subject-back').addEventListener('click', ()=>{ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById('screen-menu').classList.add('active'); });
  document.getElementById('btn-level-back').addEventListener('click', showSubjectScreen);
  document.getElementById('btn-restart').addEventListener('click', startGame);
  document.getElementById('btn-menu').addEventListener('click', ()=>{ 
  cancelAnimationFrame(animId); state=STATE.MENU;
  if (levelQueue.length > 0) {
    levelQueue = []; levelIndex = 0;
    showSubjectScreen();
  } else {
    showScreen('menu');
  }
  });
  document.getElementById('btn-confirm-quit').addEventListener('click', confirmQuit);
  document.getElementById('btn-cancel-quit').addEventListener('click', closeQuitModal);

  // Username modal
  document.getElementById('btn-username-ok').addEventListener('click', confirmUsername);
  document.getElementById('input-username').addEventListener('keydown', e=>{ if(e.code==='Enter'){e.preventDefault();confirmUsername();} });

  // File upload
  document.getElementById('file-input').addEventListener('change', e=>{
    const file=e.target.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.questions || !Array.isArray(data.questions)) throw new Error('bad');
        questions = data.questions;
        levelQueue = []; // 로컬 파일이면 Drive 레벨큐 비우기
        currentSetName = data.title || file.name;
        if (loadedLabel) loadedLabel.textContent = '✓ ' + (data.title || file.name);
        showUsernameModal(); // 바로 시작
      } catch { if (loadedLabel) loadedLabel.textContent = '⚠ Invalid JSON'; }
    };

    reader.readAsText(file);
  });

  loadDefaultQuestions();
});

// ============================================
// DRIVE — SUBJECT SELECT + AUTO LEVEL PROGRESSION
// ============================================
let levelQueue   = [];  // [{id, name}, ...] sorted list of levels for current subject
let levelIndex   = 0;   // which level we're currently on
let currentSubjectName = '';

async function showSubjectScreen() {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-subject').classList.add('active');
  const list = document.getElementById('subject-list');
  list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1"><div class="spinner"></div></div>';

  try {
    const res = await fetch(SHEETS_URL + '?action=subjects&t=' + Date.now());
    const subjects = await res.json();
    if (!subjects.length) { list.innerHTML = '<div class="lb-empty">No subjects found in Drive.</div>'; return; }
    list.innerHTML = subjects.map(s =>
      `<button class="subject-btn" data-id="${s.id}" data-name="${s.name}">
        <span class="subject-name">${s.name.replace(/_/g,' ')}</span>
        <span class="badge">${s.levels} LEVEL${s.levels>1?'S':''}</span>
      </button>`
    ).join('');
  list.querySelectorAll('.subject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // 모든 버튼 비활성화 + 클릭한 버튼 로딩 표시
      list.querySelectorAll('.subject-btn').forEach(b => b.disabled = true);
      btn.innerHTML = `<span class="subject-name">LOADING</span><div class="spinner"></div>`;
      startSubject(btn.dataset.id, btn.dataset.name);
    });
  });
  } catch(e) {
    list.innerHTML = '<div class="lb-empty">Failed to load. Check connection.</div>';
  }
}

// Called when subject card is clicked — shows level select screen
async function startSubject(folderId, subjectName) {
  currentSubjectName = subjectName.replace(/_/g,' ');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-level').classList.add('active');
  document.getElementById('level-subject-title').textContent = currentSubjectName;
  const list = document.getElementById('level-list');
  list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1"><div class="spinner"></div></div>';
  try {
    const res = await fetch(SHEETS_URL + '?action=levels&folderId=' + folderId + '&t=' + Date.now());
    levelQueue = await res.json();
    if (!levelQueue.length) { list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1">No levels found.</div>'; return; }
    list.innerHTML = levelQueue.map((l, i) => {
      // "01_cell_division.json" → "Cell Division"
      const raw = l.name.replace('.json', '');
      const title = raw.replace(/^\d+_/, '').replace(/_/g, ' ').toUpperCase();
      const num = raw.match(/^(\d+)/)?.[1] || (i + 1);
      return `<button class="subject-btn" data-index="${i}">
        <span class="subject-name">LEVEL ${num}</span>
        <span style="font-family:'Orbitron',monospace;font-size:0.55rem;color:var(--clr-text);letter-spacing:0.05em;">${title}</span>
        <span class="badge">▶ START</span>
      </button>`;
    }).join('');
  list.querySelectorAll('.subject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      list.querySelectorAll('.subject-btn').forEach(b => b.disabled = true);
      btn.innerHTML = `<span class="subject-name">LOADING</span><div class="spinner"></div>`;
      levelIndex = parseInt(btn.dataset.index);
      loadLevelByIndex(levelIndex);
    });
  });
  } catch(e) {
    list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1">Failed to load levels.</div>';
  }
}

async function loadLevelByIndex(idx, autoAdvance=false) {
  const level = levelQueue[idx];
  try {
    const res = await fetch(SHEETS_URL + '?action=file&fileId=' + level.id + '&t=' + Date.now());
    const data = await res.json();
    if (!data.questions || !Array.isArray(data.questions)) throw new Error('bad format');
    questions = data.questions;
    currentSetName = currentSubjectName + ' — Level ' + (idx + 1);
    if (autoAdvance) {
      // 자동 진행 (Continue 눌렀을 때) → 바로 시작
      actuallyStartGame();
    } else if (currentPlayer) {
      // 직접 선택, 이름 이미 있음 → 바로 시작
      actuallyStartGame();
    } else {
      // 처음 플레이 → 이름 입력
      showUsernameModal();
    }
  } catch(e) {
    alert('Failed to load level ' + (idx+1) + '. Check JSON format.');
  }
}

// "STAGE CLEAR" transition screen before next level
function showLevelTransition(levelNum, callback) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,5,20,0.97);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;z-index:300;animation:fadeInUp 0.3s ease';
  overlay.innerHTML = `
    <div style="font-family:'Press Start 2P',monospace;font-size:clamp(0.6rem,2vw,1rem);color:#39ff14;text-shadow:0 0 20px #39ff14;letter-spacing:0.15em;">✅ STAGE CLEAR!</div>
    <div style="font-family:'Press Start 2P',monospace;font-size:clamp(0.5rem,1.5vw,0.8rem);color:#00f5ff;letter-spacing:0.1em;">LEVEL ${levelNum} LOADING...</div>
    <div style="font-family:'Press Start 2P',monospace;font-size:0.45rem;color:#3a5a7a;">GET READY</div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.remove(); callback(); }, 2200);
}