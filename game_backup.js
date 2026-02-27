/* ============================================
   STUDY INVADERS — game.js
   Canvas-based retro learning shooter
   ============================================ */

'use strict';

// ============================================
// GAME STATE ENUM
// ============================================
const STATE = { MENU: 'MENU', PLAYING: 'PLAYING', MODAL: 'MODAL', GAMEOVER: 'GAMEOVER' };

// ============================================
// CONFIG — tweak difficulty here
// ============================================
const CONFIG = {
  lives: 3,
  baseEnemySpeed: 55,         // px/sec
  speedScalePerN: 5,          // correct answers before speed bump
  speedScaleAmount: 0.12,     // +12% each bump
  shipSpeed: 380,             // px/sec
  missileSpeed: 520,          // px/sec
  fireCooldown: 280,          // ms between shots
  maxMissiles: 5,
  enemyPadding: 60,           // min gap from canvas edge for enemy spawn
  starCount: 120,
  feedbackDuration: 1800,     // ms to show correct/wrong banner
};

// ============================================
// SOUND ENGINE (Web Audio API — no files needed)
// ============================================
const Sound = (() => {
  let actx = null;

  function getCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone({ freq = 440, type = 'square', vol = 0.3, duration = 0.12,
                  freqEnd = null, attack = 0.005 } = {}) {
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + duration);
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ac.currentTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + duration + 0.02);
    } catch (e) {}
  }

  function noise({ vol = 0.2, duration = 0.15 } = {}) {
    try {
      const ac = getCtx();
      const bufSize = Math.floor(ac.sampleRate * duration);
      const buffer = ac.createBuffer(1, bufSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const gain = ac.createGain();
      src.connect(gain);
      gain.connect(ac.destination);
      gain.gain.setValueAtTime(vol, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      src.start();
    } catch (e) {}
  }

  return {
    shoot()   { tone({ freq: 880, freqEnd: 220, type: 'square', vol: 0.18, duration: 0.10 }); },
    correct() {
      tone({ freq: 523, type: 'sine', vol: 0.3, duration: 0.12 });
      setTimeout(() => tone({ freq: 659, type: 'sine', vol: 0.3, duration: 0.12 }), 100);
      setTimeout(() => tone({ freq: 784, type: 'sine', vol: 0.35, duration: 0.2  }), 200);
    },
    wrong()   {
      noise({ vol: 0.15, duration: 0.08 });
      tone({ freq: 200, freqEnd: 80, type: 'sawtooth', vol: 0.25, duration: 0.25 });
    },
    miss()    {
      noise({ vol: 0.2, duration: 0.12 });
      tone({ freq: 120, type: 'sine', vol: 0.3, duration: 0.3 });
    },
    lifeLost() {
      [0, 130, 260].forEach(d =>
        setTimeout(() => tone({ freq: 330, freqEnd: 110, type: 'square', vol: 0.25, duration: 0.18 }), d)
      );
    },
    gameOver() {
      tone({ freq: 392, freqEnd: 49, type: 'sawtooth', vol: 0.3, duration: 0.9 });
      setTimeout(() => noise({ vol: 0.1, duration: 0.5 }), 200);
    },
    levelUp() {
      [523, 659, 784, 1047].forEach((freq, i) =>
        setTimeout(() => tone({ freq, type: 'square', vol: 0.2, duration: 0.18 }), i * 90)
      );
    },
    start() {
      [523, 659, 784, 1047].forEach((freq, i) =>
        setTimeout(() => tone({ freq, type: 'sine', vol: 0.25, duration: 0.15 }), i * 80)
      );
    },
  };
})();

// ============================================
// DOM REFS
// ============================================
const screens = {
  menu: document.getElementById('screen-menu'),
  game: document.getElementById('screen-game'),
  gameover: document.getElementById('screen-gameover'),
};
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const uiScore = document.getElementById('ui-score');
const uiLevel = document.getElementById('ui-level');
const uiLives = document.getElementById('ui-lives');
const uiQNum  = document.getElementById('ui-question-num');
const questionText = document.getElementById('question-text');
const feedbackBanner = document.getElementById('feedback-banner');
const modal = document.getElementById('modal-quit');
const finalScoreEl = document.getElementById('final-score');
const loadedLabel = document.getElementById('loaded-set-name');

// ============================================
// DEFAULT QUESTION SET (loaded inline as fallback)
// ============================================
const DEFAULT_SET_URL = 'questions/sample.json';

// ============================================
// GAME STATE
// ============================================
let state = STATE.MENU;
let questions = [];
let qIndex = 0;
let score = 0;
let lives = CONFIG.lives;
let correctCount = 0;
let enemySpeed = CONFIG.baseEnemySpeed;
let lastTime = 0;
let animId = null;
let fireCooldown = 0;
let feedbackTimer = 0;
let inputFrozen = false; // freeze during feedback

// Entities
let ship = {};
let missiles = [];
let enemies = [];
let stars = [];

// Key state
const keys = {};

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
  modal.classList.add('hidden');
}

// ============================================
// CANVAS RESIZE
// ============================================
function resizeCanvas() {
  const gameEl = document.getElementById('screen-game');
  const uiHeight = document.getElementById('game-ui').offsetHeight;
  const qHeight  = document.getElementById('question-bar').offsetHeight;
  canvas.width  = gameEl.clientWidth;
  canvas.height = gameEl.clientHeight - uiHeight - qHeight;
  // re-clamp ship
  if (ship.x !== undefined) {
    ship.x = Math.max(ship.width / 2, Math.min(canvas.width - ship.width / 2, ship.x));
  }
}

// ============================================
// STARFIELD
// ============================================
function initStars() {
  stars = [];
  for (let i = 0; i < CONFIG.starCount; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3,
      speed: Math.random() * 30 + 10,
      alpha: Math.random() * 0.6 + 0.2,
    });
  }
}

function updateStars(dt) {
  stars.forEach(s => {
    s.y += s.speed * dt;
    if (s.y > canvas.height) {
      s.y = 0;
      s.x = Math.random() * canvas.width;
    }
  });
}

function drawStars() {
  stars.forEach(s => {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = '#c8e8ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ============================================
// SHIP
// ============================================
function initShip() {
  ship = {
    x: canvas.width / 2,
    y: canvas.height - 60,
    width: 44,
    height: 44,
    speed: CONFIG.shipSpeed,
  };
}

function updateShip(dt) {
  if (inputFrozen) return;
  if (keys['ArrowLeft'])  ship.x -= ship.speed * dt;
  if (keys['ArrowRight']) ship.x += ship.speed * dt;
  ship.x = Math.max(ship.width / 2, Math.min(canvas.width - ship.width / 2, ship.x));
}

function drawShip() {
  const { x, y, width, height } = ship;
  const cx = x, cy = y;
  ctx.save();

  // Engine glow
  ctx.shadowColor = '#00f5ff';
  ctx.shadowBlur = 18;

  // Main body — sleek triangle
  ctx.fillStyle = '#00d4e8';
  ctx.beginPath();
  ctx.moveTo(cx, cy - height / 2);          // tip
  ctx.lineTo(cx - width / 2, cy + height / 2);
  ctx.lineTo(cx - width * 0.15, cy + height * 0.2);
  ctx.lineTo(cx, cy + height * 0.35);
  ctx.lineTo(cx + width * 0.15, cy + height * 0.2);
  ctx.lineTo(cx + width / 2, cy + height / 2);
  ctx.closePath();
  ctx.fill();

  // Wing accent
  ctx.fillStyle = '#ff2d6b';
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.1, cy + height * 0.1);
  ctx.lineTo(cx - width / 2, cy + height / 2);
  ctx.lineTo(cx - width * 0.15, cy + height * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + width * 0.1, cy + height * 0.1);
  ctx.lineTo(cx + width / 2, cy + height / 2);
  ctx.lineTo(cx + width * 0.15, cy + height * 0.2);
  ctx.closePath();
  ctx.fill();

  // Cockpit
  ctx.fillStyle = 'rgba(200,240,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx, cy - height * 0.05, width * 0.12, height * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ============================================
// MISSILES
// ============================================
function fireMissile() {
  if (inputFrozen) return;
  if (fireCooldown > 0) return;
  if (missiles.filter(m => m.active).length >= CONFIG.maxMissiles) return;
  missiles.push({
    x: ship.x,
    y: ship.y - ship.height / 2,
    width: 4,
    height: 18,
    vy: -CONFIG.missileSpeed,
    active: true,
  });
  fireCooldown = CONFIG.fireCooldown;
  Sound.shoot();
}

function updateMissiles(dt) {
  missiles.forEach(m => {
    if (!m.active) return;
    m.y += m.vy * dt;
    if (m.y + m.height < 0) m.active = false;
  });
  missiles = missiles.filter(m => m.active);
}

function drawMissiles() {
  missiles.forEach(m => {
    if (!m.active) return;
    ctx.save();
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 10;
    // Gradient missile
    const grad = ctx.createLinearGradient(m.x, m.y, m.x, m.y + m.height);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.4, '#00f5ff');
    grad.addColorStop(1, 'rgba(0,245,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(m.x - m.width / 2, m.y, m.width, m.height);
    ctx.restore();
  });
}

// ============================================
// ENEMIES (answer choices)
// ============================================
function spawnEnemies() {
  const q = questions[qIndex];
  if (!q) return;
  enemies = [];

  const count = q.choices.length;
  const padding = CONFIG.enemyPadding;
  const enemyW = Math.min(180, (canvas.width - padding * 2) / count - 20);
  const enemyH = 52;
  const slotW = (canvas.width - padding * 2) / count;

  q.choices.forEach((choice, i) => {
    const cx = padding + slotW * i + slotW / 2 + (Math.random() - 0.5) * (slotW * 0.3);
    enemies.push({
      x: cx,
      y: -enemyH - Math.random() * 60 - i * 30,
      width: enemyW,
      height: enemyH,
      choiceText: choice,
      choiceIndex: i,
      active: true,
      vy: enemySpeed,
      shimmer: Math.random() * Math.PI * 2, // phase offset for glow
    });
  });
}

function updateEnemies(dt) {
  let anyReachedBottom = false;
  enemies.forEach(e => {
    if (!e.active) return;
    e.y += e.vy * dt;
    e.shimmer += dt * 2;
    if (e.y - e.height / 2 > canvas.height) {
      e.active = false;
      anyReachedBottom = true;
    }
  });

  if (anyReachedBottom && !inputFrozen) {
    Sound.miss();
    loseLife('miss');
  }
}

function drawEnemies() {
  enemies.forEach((e) => {
    if (!e.active) return;

    ctx.save();
    const glowAlpha = 0.4 + 0.2 * Math.sin(e.shimmer);
    ctx.shadowColor = e.flashCorrect ? '#39ff14' : '#8888cc';
    ctx.shadowBlur = 14 * glowAlpha;

    // Background box
    ctx.fillStyle = e.flashCorrect ? 'rgba(0,40,10,0.9)' : 'rgba(10,10,40,0.9)';
    roundRect(ctx, e.x - e.width / 2, e.y - e.height / 2, e.width, e.height, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = e.flashCorrect ? 'rgba(57,255,20,0.6)' : 'rgba(100,120,200,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, e.x - e.width / 2, e.y - e.height / 2, e.width, e.height, 8);
    ctx.stroke();

    // Enemy "number" badge
    ctx.fillStyle = e.flashCorrect ? '#39ff14' : '#6688cc';
    ctx.font = 'bold 11px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String.fromCharCode(65 + e.choiceIndex), e.x, e.y - e.height / 2 + 14);

    // Choice text — wrap if needed
    ctx.fillStyle = '#ddeeff';
    drawWrappedText(ctx, e.choiceText, e.x, e.y, e.width - 16, e.height - 24);

    ctx.restore();
  });
}

// Utility: rounded rectangle path
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Utility: wrap text inside an enemy box
function drawWrappedText(ctx, text, cx, cy, maxWidth, maxHeight) {
  const words = text.split(' ');
  const lineHeight = 14;
  const fontSize = Math.min(13, Math.floor(maxWidth / (text.length * 0.55)) + 6);
  ctx.font = `${fontSize}px Orbitron, monospace`;
  ctx.textAlign = 'center';

  let lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);

  const totalH = lines.length * lineHeight;
  const startY = cy - totalH / 2 + lineHeight / 2;
  lines.forEach((l, i) => {
    ctx.fillText(l, cx, startY + i * lineHeight);
  });
}

// ============================================
// COLLISION
// ============================================
function checkCollisions() {
  missiles.forEach(m => {
    if (!m.active) return;
    enemies.forEach(e => {
      if (!e.active) return;
      if (aabb(m, e)) {
        m.active = false;
        e.active = false;
        handleHit(e.choiceIndex);
      }
    });
  });
}

function aabb(m, e) {
  return (
    m.x > e.x - e.width / 2 &&
    m.x < e.x + e.width / 2 &&
    m.y > e.y - e.height / 2 &&
    m.y < e.y + e.height / 2
  );
}

// ============================================
// HIT LOGIC
// ============================================
function handleHit(choiceIndex) {
  const q = questions[qIndex];
  if (choiceIndex === q.answerIndex) {
    // CORRECT — briefly flash the correct enemy green before feedback
    const correctEnemy = enemies.find(e => e.choiceIndex === q.answerIndex);
    if (correctEnemy) correctEnemy.flashCorrect = true;

    score += 10 + Math.max(0, lives) * 2;
    correctCount++;
    // Speed bump
    if (correctCount % CONFIG.speedScalePerN === 0) {
      enemySpeed *= (1 + CONFIG.speedScaleAmount);
      Sound.levelUp();
    } else {
      Sound.correct();
    }
    showFeedback(true, q.explain || '');
  } else {
    // WRONG
    loseLife('wrong');
    Sound.wrong();
    showFeedback(false, '');
  }
}

function loseLife(reason) {
  if (inputFrozen) return;
  lives = Math.max(0, lives - 1);
  updateHUD();
  if (lives <= 0) {
    endGame();
    return;
  }
  Sound.lifeLost();
  // respawn same question
  if (reason === 'wrong') {
    showFeedback(false, '');
  } else {
    // reached bottom — brief pause then respawn
    inputFrozen = true;
    setTimeout(() => {
      inputFrozen = false;
      spawnEnemies();
    }, 800);
  }
}

// ============================================
// FEEDBACK BANNER
// ============================================
function showFeedback(correct, explain) {
  inputFrozen = true;
  feedbackBanner.className = 'feedback ' + (correct ? 'correct' : 'wrong');
  feedbackBanner.innerHTML = `
    <span class="fb-icon">${correct ? '✅ CORRECT!' : '❌ WRONG!'}</span>
    ${explain ? `<span class="fb-explain">${explain}</span>` : ''}
  `;
  feedbackBanner.classList.remove('hidden');

  setTimeout(() => {
    feedbackBanner.classList.add('hidden');
    feedbackBanner.className = 'feedback hidden';
    inputFrozen = false;
    if (correct) {
      advanceQuestion();
    } else {
      spawnEnemies(); // retry same question
    }
  }, CONFIG.feedbackDuration);
}

// ============================================
// QUESTION FLOW
// ============================================
function advanceQuestion() {
  qIndex++;
  missiles = [];
  if (qIndex >= questions.length) {
    // Completed all questions!
    endGame(true);
    return;
  }
  loadQuestion();
}

function loadQuestion() {
  const q = questions[qIndex];
  questionText.textContent = q.prompt;
  updateHUD();
  spawnEnemies();
}

// ============================================
// HUD UPDATE
// ============================================
function updateHUD() {
  uiScore.textContent = 'SCORE: ' + score;
  uiLives.textContent = '♥ '.repeat(lives).trim() || '💀';
  uiQNum.textContent  = `Q ${qIndex + 1} / ${questions.length}`;
  const level = Math.floor(correctCount / CONFIG.speedScalePerN) + 1;
  uiLevel.textContent = 'LV ' + level;
}

// ============================================
// GAME OVER / WIN
// ============================================
function endGame(win = false) {
  state = STATE.GAMEOVER;
  cancelAnimationFrame(animId);
  Sound.gameOver();
  finalScoreEl.textContent = score;
  document.getElementById('over-title').textContent = win ? '🎉 COMPLETE!' : 'GAME OVER';
  document.getElementById('over-title').style.color = win ? 'var(--clr-green)' : 'var(--clr-accent)';
  showScreen('gameover');
}

// ============================================
// MAIN LOOP
// ============================================
function loop(ts) {
  if (state !== STATE.PLAYING) return;
  const dt = Math.min((ts - lastTime) / 1000, 0.05); // cap dt to avoid spiral of death
  lastTime = ts;

  fireCooldown = Math.max(0, fireCooldown - dt * 1000);

  // Updates
  updateStars(dt);
  if (!inputFrozen) {
    updateShip(dt);
    updateMissiles(dt);
    updateEnemies(dt);
    checkCollisions();
  } else {
    // still allow missiles to travel during feedback
    updateMissiles(dt);
  }

  // Draw
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawStars();
  drawEnemies();
  drawMissiles();
  drawShip();

  animId = requestAnimationFrame(loop);
}

// ============================================
// START GAME
// ============================================
function startGame() {
  if (questions.length === 0) {
    loadDefaultQuestions().then(startGame);
    return;
  }
  qIndex = 0;
  score = 0;
  lives = CONFIG.lives;
  correctCount = 0;
  enemySpeed = CONFIG.baseEnemySpeed;
  missiles = [];
  inputFrozen = false;
  state = STATE.PLAYING;
  Sound.start();
  showScreen('game');
  resizeCanvas();
  initStars();
  initShip();
  loadQuestion();
  updateHUD();
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
}

// ============================================
// LOAD QUESTIONS
// ============================================
async function loadDefaultQuestions() {
  try {
    const res = await fetch(DEFAULT_SET_URL);
    const data = await res.json();
    questions = data.questions;
    loadedLabel.textContent = '✓ ' + (data.title || 'Default set loaded');
  } catch (e) {
    console.warn('Could not load default questions, using hardcoded fallback.');
    questions = getFallbackQuestions();
  }
}

function getFallbackQuestions() {
  return [
    { prompt: "What is 2 + 2?", choices: ["3", "4", "5", "6"], answerIndex: 1, explain: "2 + 2 = 4. Classic!" },
    { prompt: "What planet is closest to the Sun?", choices: ["Earth", "Mars", "Mercury", "Venus"], answerIndex: 2, explain: "Mercury is the innermost planet in our solar system." },
    { prompt: "What is the chemical symbol for water?", choices: ["O2", "CO2", "H2O", "NaCl"], answerIndex: 2, explain: "Water is H₂O — two hydrogen atoms bonded to one oxygen." },
  ];
}

// ============================================
// QUIT MODAL
// ============================================
function openQuitModal() {
  if (state !== STATE.PLAYING) return;
  state = STATE.MODAL;
  modal.classList.remove('hidden');
}

function closeQuitModal() {
  if (state !== STATE.MODAL) return;
  state = STATE.PLAYING;
  modal.classList.add('hidden');
  lastTime = performance.now(); // prevent dt spike
  animId = requestAnimationFrame(loop);
}

function confirmQuit() {
  cancelAnimationFrame(animId);
  state = STATE.MENU;
  modal.classList.add('hidden');
  showScreen('menu');
}

// ============================================
// KEYBOARD INPUT
// ============================================
document.addEventListener('keydown', e => {
  keys[e.code] = true;

  // Fire
  if (e.code === 'Space') {
    e.preventDefault();
    if (state === STATE.PLAYING) fireMissile();
    if (state === STATE.MENU) startGame();
  }

  // ESC — open/close modal
  if (e.code === 'Escape') {
    if (state === STATE.PLAYING) openQuitModal();
    else if (state === STATE.MODAL) closeQuitModal();
  }

  // ENTER
  if (e.code === 'Enter') {
    if (state === STATE.MENU) startGame();
    if (state === STATE.MODAL) confirmQuit();
    if (state === STATE.GAMEOVER) startGame();
  }
});

document.addEventListener('keyup', e => {
  keys[e.code] = false;
});

// ============================================
// BUTTON EVENTS
// ============================================
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-menu').addEventListener('click', () => {
  cancelAnimationFrame(animId);
  state = STATE.MENU;
  showScreen('menu');
});
document.getElementById('btn-confirm-quit').addEventListener('click', confirmQuit);
document.getElementById('btn-cancel-quit').addEventListener('click', closeQuitModal);

// File upload
document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.questions || !Array.isArray(data.questions)) throw new Error('Invalid format');
      questions = data.questions;
      loadedLabel.textContent = '✓ ' + (data.title || file.name);
    } catch (err) {
      loadedLabel.textContent = '⚠ Invalid JSON format';
    }
  };
  reader.readAsText(file);
});

// ============================================
// RESIZE HANDLER
// ============================================
window.addEventListener('resize', () => {
  if (state === STATE.PLAYING || state === STATE.MODAL) {
    resizeCanvas();
    // re-place ship sensibly
    ship.y = canvas.height - 60;
  }
});

// ============================================
// BOOT — preload default questions
// ============================================
loadDefaultQuestions();