/* ============================================
   STUDY INVADERS — game.js (main orchestrator)
   ============================================ */
'use strict';

import { STATE, CONFIG } from './modules/config.js';
import Sound from './modules/sound.js';
import { lbSubmit, lbFetch, lbRender } from './modules/leaderboard.js';
import { resetReview, recordWrong, hasWrongAnswers, showReviewOverlay } from './modules/review.js';
import {
  levelQueue, levelIndex, currentSubjectName,
  setLevelIndex, clearLevelQueue,
  showSubjectScreen, startSubject, loadLevelByIndex,
} from './modules/drive.js';
import {
  initCanvas, resizeCanvas,
  initStars, updateStars, drawStars,
  initShip, updateShip, drawShip,
  fireMissile, updateMissiles, drawMissiles,
  spawnEnemies, updateEnemies, drawEnemies,
  checkCollisions, updateHUD, drawQuestionCard,
  updateBonusEnemies, drawBonusEnemies, checkBonusCollisions, resetBonusSystem,
  enemies, missiles, ship, canvas,
} from './modules/gameplay.js';

// ── Runtime state ──
let state = STATE.MENU;
let questions = [], qIndex = 0, score = 0, lives = CONFIG.lives;
let correctCount = 0, enemySpeed = CONFIG.baseEnemySpeed;
let lastTime = 0, animId = null, fireCooldown = 0, inputFrozen = false;
let readTimer = 0, prevReadSec = 0;
let currentPlayer = '', currentSetName = 'Sample';
const keys = {};

// ── Touch state ──
let touchId = null;
let touchStartY = 0;
let touchCurrentX = 0;
let touchCurrentY = 0;
let touchPullEl = null;
const PULL_THRESHOLD = 35;
const PULL_MAX = 110;

// ── DOM refs ──
let feedbackBanner, quitModal, finalScoreEl, loadedLabel;

// ── Screen ──
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name)?.classList.add('active');
  quitModal.classList.add('hidden');
}

// ── Feedback ──
function showFeedback(correct, explain, onDone = null) {
  inputFrozen = true;
  feedbackBanner.className = 'feedback ' + (correct ? 'correct' : 'wrong');
  feedbackBanner.innerHTML = `<span class="fb-icon">${correct ? '✅ CORRECT!' : '❌ WRONG!'}</span>`
    + (explain ? `<span class="fb-explain">${explain}</span>` : '');
  feedbackBanner.classList.remove('hidden');
  setTimeout(() => {
    feedbackBanner.classList.add('hidden');
    inputFrozen = false;
    if (onDone) { onDone(); return; }
    if (correct) advanceQuestion(); else spawnEnemies(questions[qIndex], enemySpeed);
  }, CONFIG.feedbackDuration);
}

// ── Hit / Life ──
function handleHit(choiceIndex) {
  const q = questions[qIndex];
  if (choiceIndex === q.answerIndex) {
    const hit = enemies.find(e => e.choiceIndex === q.answerIndex);
    if (hit) hit.flashCorrect = true;
    score += 10 + Math.max(0, lives) * 2; correctCount++;
    if (correctCount % CONFIG.speedScalePerN === 0) { enemySpeed *= (1 + CONFIG.speedScaleAmount); Sound.levelUp(); } else Sound.correct();
    showFeedback(true, q.explain || '');
  } else {
    recordWrong({ prompt: q.prompt, choices: q.choices, answerIndex: q.answerIndex, myChoiceIndex: choiceIndex, explain: q.explain });
    Sound.wrong();
    loseLife('wrong');
  }
}

function loseLife(reason) {
  if (inputFrozen) return;
  lives = Math.max(0, lives - 1);
  updateHUD(score, lives, qIndex, questions, correctCount, currentPlayer);
  if (lives <= 0) {
    if (reason === 'wrong') {
      const explain = questions[qIndex]?.explain || '';
      showFeedback(false, explain, () => endGame());
    } else {
      endGame();
    }
    return;
  }
  Sound.lifeLost();
  if (reason === 'wrong') showFeedback(false, '');
  else { inputFrozen = true; setTimeout(() => { inputFrozen = false; spawnEnemies(questions[qIndex], enemySpeed); }, 800); }
}

// ── Question flow ──
function advanceQuestion() {
  qIndex++; missiles.length = 0;
  if (qIndex >= questions.length) { endGame(true); return; }
  loadQuestion();
}

function loadQuestion() {
  document.getElementById('question-text').textContent = questions[qIndex].prompt;
  updateHUD(score, lives, qIndex, questions, correctCount, currentPlayer);
  missiles.length = 0; enemies.length = 0;
  readTimer = CONFIG.readDuration; prevReadSec = Math.ceil(readTimer);
  state = STATE.READING;
}

function startEnemyPhase() {
  state = STATE.PLAYING; lastTime = performance.now();
  spawnEnemies(questions[qIndex], enemySpeed);
}

// ── Game Over ──
async function endGame(win = false) {
  state = STATE.GAMEOVER;
  cancelAnimationFrame(animId);
  if (win) Sound.stageClear(); else Sound.gameOver();

  const hasNext = levelQueue.length > 0 && levelIndex + 1 < levelQueue.length;
  if (win && hasNext) { showNextLevelPrompt(); return; }

  finalScoreEl.textContent = score;
  const t = document.getElementById('over-title');
  if (win && levelQueue.length > 0) {
    t.textContent = '🎓 COURSE COMPLETE!'; t.style.color = 'var(--clr-green)';
  } else {
    t.textContent = win ? '🎉 COMPLETE!' : 'GAME OVER';
    t.style.color = win ? 'var(--clr-green)' : 'var(--clr-accent)';
  }
  showScreen('gameover');
  addReviewButton();
  await saveAndShowLeaderboard();
}

function addReviewButton() {
  const existing = document.getElementById('btn-review');
  if (existing) existing.remove();
  if (!hasWrongAnswers()) return;
  const btn = document.createElement('button');
  btn.id = 'btn-review';
  btn.className = 'btn-secondary';
  btn.style.cssText = 'margin-top:0.8rem;border-color:#ff4466;color:#ff4466;';
  btn.textContent = '📋 REVIEW MISTAKES';
  btn.addEventListener('click', showReviewOverlay);
  document.querySelector('.over-buttons').insertAdjacentElement('afterend', btn);
}

async function saveAndShowLeaderboard() {
  const list = document.getElementById('lb-list');
  if (list) list.innerHTML = '<div class="lb-empty"><div class="spinner"></div></div>';
  if (currentPlayer) await lbSubmit(currentPlayer, score, currentSetName);
  await new Promise(r => setTimeout(r, 1200));
  const entries = await lbFetch();
  lbRender(currentPlayer, entries);
}

// ── Next level prompt ──
function showNextLevelPrompt() {
  const mistakes = hasWrongAnswers();
  const reviewBtn = mistakes ? `
    <button id="btn-next-review" style="
      font-family:'Press Start 2P',monospace;font-size:0.5rem;
      background:transparent;color:#ff4466;
      border:2px solid #ff4466;padding:0.9rem 1.5rem;
      cursor:pointer;border-radius:6px;letter-spacing:0.06em;
    ">📋 REVIEW</button>` : '';
  const perfectMsg = !mistakes ? `
    <div style="font-family:'Press Start 2P',monospace;font-size:0.45rem;
      color:#39ff14;letter-spacing:0.08em;">⭐ PERFECT PACK!</div>` : '';

  const overlay = document.createElement('div');
  overlay.id = 'modal-nextlevel';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,5,20,0.95);display:flex;align-items:center;justify-content:center;z-index:300;';
  overlay.innerHTML = `
    <div style="background:#040d1f;border:2px solid var(--clr-primary);border-radius:12px;
      padding:2.5rem 3rem;display:flex;flex-direction:column;align-items:center;
      gap:1.2rem;box-shadow:0 0 40px rgba(0,245,255,0.2);max-width:90vw;">
      <div style="font-family:'Press Start 2P',monospace;font-size:clamp(0.6rem,1.8vw,0.9rem);
        color:#39ff14;text-shadow:0 0 16px #39ff14;letter-spacing:0.1em;">✅ STAGE CLEAR!</div>
      ${perfectMsg}
      <div style="font-family:'Press Start 2P',monospace;font-size:clamp(0.45rem,1.2vw,0.65rem);
        color:var(--clr-primary);letter-spacing:0.08em;">NEXT PACK READY</div>
      <div style="font-family:'Orbitron',monospace;font-size:0.9rem;color:var(--clr-text);">
        Continue to the next pack?</div>
      <div style="font-family:'Press Start 2P',monospace;font-size:0.4rem;color:var(--clr-gold);">
        SCORE: ${score}</div>
      <div style="display:flex;gap:0.8rem;margin-top:0.3rem;flex-wrap:wrap;justify-content:center;">
        ${reviewBtn}
        <button id="btn-next-yes" style="font-family:'Press Start 2P',monospace;font-size:0.5rem;
          background:var(--clr-primary);color:#000;border:none;
          padding:0.9rem 1.5rem;cursor:pointer;border-radius:6px;">▶ CONTINUE</button>
        <button id="btn-next-no" style="font-family:'Press Start 2P',monospace;font-size:0.5rem;
          background:transparent;color:var(--clr-text);border:2px solid var(--clr-dim);
          padding:0.9rem 1.5rem;cursor:pointer;border-radius:6px;">✕ FINISH</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('btn-next-review')?.addEventListener('click', () => showReviewOverlay());
  document.getElementById('btn-next-yes').addEventListener('click', async () => {
    overlay.remove(); resetReview();
    setLevelIndex(levelIndex + 1);
    await loadLevelByIndex(levelIndex, true);
  });
  document.getElementById('btn-next-no').addEventListener('click', async () => {
    overlay.remove();
    finalScoreEl.textContent = score;
    const t = document.getElementById('over-title');
    t.textContent = '🎉 STAGE CLEAR!'; t.style.color = 'var(--clr-green)';
    showScreen('gameover');
    addReviewButton();
    await saveAndShowLeaderboard();
  });
}

// ── Heart gain effect ──
function showHeartGainEffect() {
  const el = document.createElement('div');
  el.textContent = '♥ +1 LIFE!';
  el.style.cssText = `
    position:fixed;left:50%;top:30%;transform:translateX(-50%);
    font-family:'Press Start 2P',monospace;font-size:clamp(0.8rem,2vw,1.2rem);
    color:#ff6eb4;text-shadow:0 0 20px #ff6eb4;
    pointer-events:none;z-index:500;
    animation:heartPop 1.2s ease forwards;
  `;
  document.body.appendChild(el);
  if (!document.getElementById('heart-pop-style')) {
    const style = document.createElement('style');
    style.id = 'heart-pop-style';
    style.textContent = `@keyframes heartPop {
      0%   { opacity:0; transform:translateX(-50%) scale(0.5); }
      20%  { opacity:1; transform:translateX(-50%) scale(1.3); }
      60%  { opacity:1; transform:translateX(-50%) scale(1.0); }
      100% { opacity:0; transform:translateX(-50%) translateY(-40px) scale(0.8); }
    }`;
    document.head.appendChild(style);
  }
  setTimeout(() => el.remove(), 1300);
}

// ── Touch controls ──
function initTouchControls() {
  const cvs = document.getElementById('game-canvas');
  if (!cvs) return;

  cvs.addEventListener('touchstart', e => {
    e.preventDefault();
    if (state === STATE.READING) { readTimer = 0; return; }
    if (state !== STATE.PLAYING) return;
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier;
    touchStartY = t.clientY;
    touchCurrentX = t.clientX;
    touchCurrentY = t.clientY;
    showPullIndicator();
  }, { passive: false });

  cvs.addEventListener('touchmove', e => {
    e.preventDefault();
    if (touchId === null) return;
    const t = [...e.changedTouches].find(x => x.identifier === touchId);
    if (!t) return;
    touchCurrentX = t.clientX;
    touchCurrentY = t.clientY;

    // 우주선 X — 터치 위치 따라옴
    const rect = cvs.getBoundingClientRect();
    const relX = t.clientX - rect.left;
    if (ship && canvas) {
      ship.x = Math.max(ship.width / 2, Math.min(canvas.width - ship.width / 2, (relX / rect.width) * canvas.width));
    }
    updatePullIndicator();
  }, { passive: false });

  cvs.addEventListener('touchend', e => {
    e.preventDefault();
    const t = [...e.changedTouches].find(x => x.identifier === touchId);
    if (!t) return;
    touchId = null;
    hidePullIndicator();
    if (state !== STATE.PLAYING || inputFrozen) return;

    const dy = touchCurrentY - touchStartY;
    if (dy > PULL_THRESHOLD) {
      const ratio = Math.min(dy / PULL_MAX, 1);
      const shots = Math.floor(ratio * 2) + 1;
      for (let i = 0; i < shots; i++) {
        setTimeout(() => {
          if (fireMissile(inputFrozen, fireCooldown)) {
            Sound.shoot();
            fireCooldown = CONFIG.fireCooldown;
          }
        }, i * 80);
      }
    }
  }, { passive: false });

    // 더블탭 감지
  let lastTapTime = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    const timeSince = now - lastTapTime;
    if (timeSince < 300 && timeSince > 0) {
      // 더블탭
      if (state === STATE.PLAYING || state === STATE.READING) {
        openQuitModal();
      }
    }
    lastTapTime = now;
  }, { passive: true });
}

function showPullIndicator() {
  if (touchPullEl) return;
  touchPullEl = document.createElement('div');
  touchPullEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200;';
  document.body.appendChild(touchPullEl);
}

function updatePullIndicator() {
  if (!touchPullEl) return;
  const dy = Math.max(0, touchCurrentY - touchStartY);
  if (dy < 10) { touchPullEl.innerHTML = ''; return; }
  const ratio = Math.min(dy / PULL_MAX, 1);
  const shots = Math.floor(ratio * 2) + 1;
  const color = ratio < 0.4 ? '#00f5ff' : ratio < 0.8 ? '#ffd700' : '#ff2d6b';
  const sw = 1.5 + ratio * 2.5;
  touchPullEl.innerHTML = `
    <svg style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
      <line x1="${touchCurrentX}" y1="${touchStartY}"
            x2="${touchCurrentX}" y2="${touchCurrentY}"
            stroke="${color}" stroke-width="${sw}"
            stroke-dasharray="8 5" opacity="${0.5 + ratio * 0.5}"/>
      <circle cx="${touchCurrentX}" cy="${touchCurrentY}"
              r="${5 + ratio * 10}" fill="none"
              stroke="${color}" stroke-width="2"
              opacity="${0.6 + ratio * 0.4}"/>
    </svg>
    <div style="position:absolute;left:${touchCurrentX}px;top:${touchCurrentY - 40}px;
      transform:translateX(-50%);font-family:'Press Start 2P',monospace;
      font-size:0.55rem;color:${color};text-shadow:0 0 8px ${color};white-space:nowrap;">
      ${'▶'.repeat(shots)}
    </div>`;
}

function hidePullIndicator() {
  if (touchPullEl) { touchPullEl.remove(); touchPullEl = null; }
}

// ── Main loop ──
function loop(ts) {
  if (state !== STATE.PLAYING && state !== STATE.READING) return;
  const dt = Math.min((ts - lastTime) / 1000, 0.05); lastTime = ts;

  if (state === STATE.READING) {
    readTimer -= dt;
    const ns = Math.ceil(readTimer);
    if (ns < prevReadSec && ns > 0) Sound.tick();
    prevReadSec = ns;
    updateStars(dt);
    const cvs = document.getElementById('game-canvas');
    cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height);
    drawStars(); drawQuestionCard(questions[qIndex], qIndex, questions.length, readTimer);
    if (readTimer <= 0) startEnemyPhase();
    animId = requestAnimationFrame(loop); return;
  }

  fireCooldown = Math.max(0, fireCooldown - dt * 1000);
  updateStars(dt);
  updateBonusEnemies(dt, inputFrozen);
  if (!inputFrozen) {
    updateShip(dt, keys, inputFrozen);
    updateMissiles(dt);
    const bottom = updateEnemies(dt);
    if (bottom && !inputFrozen) { Sound.miss(); loseLife('miss'); }
    const hits = checkCollisions();
    hits.forEach(choiceIndex => handleHit(choiceIndex));
    const { hit: bonusHit, heartGained } = checkBonusCollisions(lives);
    if (bonusHit) {
      if (heartGained) {
        lives = Math.min(5, lives + 1);
        updateHUD(score, lives, qIndex, questions, correctCount, currentPlayer);
        Sound.bonusHeart();
        showHeartGainEffect();
      } else {
        Sound.bonusHit();
      }
    }
  } else {
    updateMissiles(dt);
  }
  const cvs = document.getElementById('game-canvas');
  cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height);
  drawStars(); drawBonusEnemies(); drawEnemies(); drawMissiles(); drawShip();
  animId = requestAnimationFrame(loop);
}

// ── Username modal ──
function showUsernameModal() {
  const inp = document.getElementById('input-username');
  inp.value = '';
  document.getElementById('modal-username').classList.remove('hidden');
  setTimeout(() => inp.focus(), 80);
}
function confirmUsername() {
  const name = document.getElementById('input-username').value.trim();
  if (!name) return;
  currentPlayer = name;
  document.getElementById('modal-username').classList.add('hidden');
  actuallyStartGame();
}

// ── Start game ──
function startGame() {
  resetReview();
  if (state === STATE.GAMEOVER && currentPlayer) { actuallyStartGame(); return; }
  showUsernameModal();
}

function actuallyStartGame() {
  qIndex = 0; score = 0; lives = CONFIG.lives; correctCount = 0;
  enemySpeed = CONFIG.baseEnemySpeed; missiles.length = 0; inputFrozen = false; fireCooldown = 0;
  resetBonusSystem();
  Sound.start();
  showScreen('game'); resizeCanvas(); initStars(); initShip();
  // 모바일에서 렌더링 지연 후 재조정
  setTimeout(() => resizeCanvas(), 100);
  updateHUD(score, lives, qIndex, questions, correctCount, currentPlayer);
  loadQuestion();
  lastTime = performance.now(); animId = requestAnimationFrame(loop);
}

// ── Quit modal ──
function openQuitModal() { if (state !== STATE.PLAYING && state !== STATE.READING) return; state = STATE.MODAL; quitModal.classList.remove('hidden'); }
function closeQuitModal() { if (state !== STATE.MODAL) return; state = enemies.length === 0 ? STATE.READING : STATE.PLAYING; quitModal.classList.add('hidden'); lastTime = performance.now(); animId = requestAnimationFrame(loop); }
function confirmQuit() { cancelAnimationFrame(animId); state = STATE.MENU; quitModal.classList.add('hidden'); Sound.bgmStop(); showScreen('menu'); }

// ── Keyboard ──
document.addEventListener('keydown', e => {
  keys[e.code] = true;
  const um = document.getElementById('modal-username');
  if (um && !um.classList.contains('hidden')) {
    if (e.code === 'Enter') { e.preventDefault(); confirmUsername(); }
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (state === STATE.READING) readTimer = 0;
    else if (state === STATE.PLAYING) {
      if (fireMissile(inputFrozen, fireCooldown)) { Sound.shoot(); fireCooldown = CONFIG.fireCooldown; }
    }
    else if (state === STATE.MENU) startGame();
  }
  if (e.code === 'Escape') {
    if (state === STATE.PLAYING || state === STATE.READING) openQuitModal();
    else if (state === STATE.MODAL) closeQuitModal();
  }
  if (e.code === 'Enter') {
    if (state === STATE.MENU) startGame();
    else if (state === STATE.MODAL) confirmQuit();
    else if (state === STATE.GAMEOVER) startGame();
  }
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  initTouchControls();
  feedbackBanner = document.getElementById('feedback-banner');
  quitModal      = document.getElementById('modal-quit');
  finalScoreEl   = document.getElementById('final-score');
  loadedLabel    = document.getElementById('loaded-set-name');

  document.getElementById('btn-start').addEventListener('click', showSubjectScreen);
  document.getElementById('btn-subject-back').addEventListener('click', () => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-menu').classList.add('active');
  });
  document.getElementById('btn-level-back').addEventListener('click', showSubjectScreen);
  document.getElementById('btn-restart').addEventListener('click', startGame);
  document.getElementById('btn-menu').addEventListener('click', () => {
    cancelAnimationFrame(animId); state = STATE.MENU;
    if (levelQueue.length > 0) { clearLevelQueue(); Sound.bgmStop(); showSubjectScreen(); }
    else { Sound.bgmStop(); showScreen('menu'); }
  });
  document.getElementById('btn-confirm-quit').addEventListener('click', confirmQuit);
  document.getElementById('btn-cancel-quit').addEventListener('click', closeQuitModal);
  document.getElementById('btn-username-ok').addEventListener('click', confirmUsername);
  document.getElementById('input-username').addEventListener('keydown', e => {
    if (e.code === 'Enter') { e.preventDefault(); confirmUsername(); }
  });

  // Local file upload
  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.questions || !Array.isArray(data.questions)) throw new Error('bad');
        questions = data.questions;
        clearLevelQueue();
        currentSetName = data.title || file.name;
        if (loadedLabel) loadedLabel.textContent = '✓ ' + (data.title || file.name);
        resetReview();
        showUsernameModal();
      } catch { if (loadedLabel) loadedLabel.textContent = '⚠ Invalid JSON'; }
    };
    reader.readAsText(file);
  });

  // Drive events
  document.addEventListener('subject-selected', e => {
    startSubject(e.detail.id, e.detail.name);
  });
  document.addEventListener('level-selected', e => {
    setLevelIndex(e.detail.index);
    loadLevelByIndex(e.detail.index);
  });
  document.addEventListener('level-loaded', e => {
    questions = e.detail.questions;
    currentSetName = e.detail.setName;
    if (e.detail.autoAdvance || currentPlayer) actuallyStartGame();
    else showUsernameModal();
  });
});