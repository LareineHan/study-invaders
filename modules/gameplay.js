import { CONFIG } from './config.js';

// ── Canvas refs ──
export let canvas, ctx;
export let ship = {}, missiles = [], enemies = [], stars = [];

// ── Bonus enemy state ──
export let bonusEnemies = [];
let bonusParticles = [];
let bonusKillCount = 0;         // 현재 세션 보너스 킬 수
let bonusSpawnTimer = 0;        // 다음 스폰까지 남은 시간
let bonusSpawnInterval = 0;     // 현재 스폰 인터벌 (랜덤)

const BONUS_KILLS_FOR_HEART = 3;
const MAX_LIVES = 5;
const BONUS_SPEED_X = 120;      // 수평 이동 속도
const BONUS_SPEED_Y = 40;       // 천천히 내려옴
const BONUS_SIZE = 38;

function randomBonusInterval() {
  return 8 + Math.random() * 12; // 8~20초 랜덤
}

export function resetBonusSystem() {
  bonusEnemies = [];
  bonusKillCount = 0;
  bonusSpawnTimer = randomBonusInterval();
  bonusSpawnInterval = bonusSpawnTimer;
}

export function initCanvas() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
}

export function resizeCanvas() {
  const g = document.getElementById('screen-game');
  canvas.width = g.clientWidth;
  canvas.height = g.clientHeight
    - document.getElementById('game-ui').offsetHeight
    - document.getElementById('question-bar').offsetHeight;
  if (ship.x !== undefined)
    ship.x = Math.max(ship.width / 2, Math.min(canvas.width - ship.width / 2, ship.x));
}

// ── Stars ──
export function initStars() {
  stars = Array.from({ length: CONFIG.starCount }, () => ({
    x: Math.random() * canvas.width, y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.3, speed: Math.random() * 30 + 10, alpha: Math.random() * 0.6 + 0.2,
  }));
}
export function updateStars(dt) {
  stars.forEach(s => { s.y += s.speed * dt; if (s.y > canvas.height) { s.y = 0; s.x = Math.random() * canvas.width; } });
}
export function drawStars() {
  stars.forEach(s => { ctx.save(); ctx.globalAlpha = s.alpha; ctx.fillStyle = '#c8e8ff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
}

// ── Ship ──
export function initShip() {
  ship = { x: canvas.width / 2, y: canvas.height - 60, width: 44, height: 44, speed: CONFIG.shipSpeed };
}
export function updateShip(dt, keys, inputFrozen) {
  if (inputFrozen) return;
  if (keys['ArrowLeft'])  ship.x -= ship.speed * dt;
  if (keys['ArrowRight']) ship.x += ship.speed * dt;
  ship.x = Math.max(ship.width / 2, Math.min(canvas.width - ship.width / 2, ship.x));
}
export function drawShip() {
  const { x, y, width: w, height: h } = ship;
  ctx.save(); ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 18; ctx.fillStyle = '#00d4e8';
  ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.lineTo(x - w * 0.15, y + h * 0.2); ctx.lineTo(x, y + h * 0.35); ctx.lineTo(x + w * 0.15, y + h * 0.2); ctx.lineTo(x + w / 2, y + h / 2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff2d6b';
  [[x - w * 0.1, y + h * 0.1, x - w / 2, y + h / 2, x - w * 0.15, y + h * 0.2], [x + w * 0.1, y + h * 0.1, x + w / 2, y + h / 2, x + w * 0.15, y + h * 0.2]].forEach(([x1, y1, x2, y2, x3, y3]) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill(); });
  ctx.fillStyle = 'rgba(200,240,255,0.85)'; ctx.beginPath(); ctx.ellipse(x, y - h * 0.05, w * 0.12, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ── Missiles ──
export function fireMissile(inputFrozen, fireCooldown) {
  if (inputFrozen || fireCooldown > 0) return false;
  if (missiles.filter(m => m.active).length >= CONFIG.maxMissiles) return false;
  missiles.push({ x: ship.x, y: ship.y - ship.height / 2, width: 4, height: 18, vy: -CONFIG.missileSpeed, active: true });
  return true;
}
export function updateMissiles(dt) {
  missiles.forEach(m => { if (m.active) { m.y += m.vy * dt; if (m.y < 0) m.active = false; } });
  missiles = missiles.filter(m => m.active);
}
export function drawMissiles() {
  missiles.forEach(m => {
    if (!m.active) return;
    ctx.save(); ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 10;
    const g = ctx.createLinearGradient(m.x, m.y, m.x, m.y + m.height);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#00f5ff'); g.addColorStop(1, 'rgba(0,245,255,0)');
    ctx.fillStyle = g; ctx.fillRect(m.x - m.width / 2, m.y, m.width, m.height); ctx.restore();
  });
}

// ── Enemies ──
export function spawnEnemies(question, enemySpeed) {
  if (!question) return;
  enemies = [];
  const count = question.choices.length;
  const pad = canvas.width < 500 ? 10 : CONFIG.enemyPadding;
  const gap = canvas.width < 500 ? 14 : 20;
  const eW = Math.min(180, (canvas.width - pad * 2) / count - gap), eH = 52, slotW = (canvas.width - pad * 2) / count;
  question.choices.forEach((choice, i) => {
    enemies.push({ x: pad + slotW * i + slotW / 2 + (Math.random() - 0.5) * slotW * 0.3, y: -eH - Math.random() * 60 - i * 30, width: eW, height: eH, choiceText: choice, choiceIndex: i, active: true, vy: enemySpeed, shimmer: Math.random() * Math.PI * 2, flashCorrect: false });
  });
}
export function updateEnemies(dt) {
  let bottom = false;
  enemies.forEach(e => { if (!e.active) return; e.y += e.vy * dt; e.shimmer += dt * 2; if (e.y - e.height / 2 > canvas.height) { e.active = false; bottom = true; } });
  return bottom;
}
export function drawEnemies() {
  enemies.forEach(e => {
    if (!e.active) return;
    ctx.save();
    ctx.shadowColor = e.flashCorrect ? '#39ff14' : '#8888cc';
    ctx.shadowBlur = 14 * (0.4 + 0.2 * Math.sin(e.shimmer));
    ctx.fillStyle = e.flashCorrect ? 'rgba(0,40,10,0.9)' : 'rgba(10,10,40,0.9)';
    rrect(ctx, e.x - e.width / 2, e.y - e.height / 2, e.width, e.height, 8); ctx.fill();
    ctx.strokeStyle = e.flashCorrect ? 'rgba(57,255,20,0.6)' : 'rgba(100,120,200,0.5)';
    ctx.lineWidth = 1.5; rrect(ctx, e.x - e.width / 2, e.y - e.height / 2, e.width, e.height, 8); ctx.stroke();
    ctx.fillStyle = e.flashCorrect ? '#39ff14' : '#6688cc';
    ctx.font = 'bold 11px Orbitron,monospace'; ctx.textAlign = 'center';
    ctx.fillText(String.fromCharCode(65 + e.choiceIndex), e.x, e.y - e.height / 2 + 14);
    ctx.fillStyle = '#ddeeff'; wrapText(ctx, e.choiceText, e.x, e.y, e.width - 16);
    ctx.restore();
  });
}

// ── Bonus Enemies ──
function spawnBonusEnemy() {
  const fromLeft = Math.random() < 0.5;
  const s = BONUS_SIZE;
  bonusEnemies.push({
    x: fromLeft ? -s : canvas.width + s,
    y: canvas.height * 0.15 + Math.random() * canvas.height * 0.35,
    size: s,
    vx: fromLeft ? BONUS_SPEED_X : -BONUS_SPEED_X,
    vy: BONUS_SPEED_Y,
    active: true,
    shimmer: Math.random() * Math.PI * 2,
    hp: 1,
  });
}

export function updateBonusEnemies(dt, inputFrozen) {
  if (inputFrozen) {
    // inputFrozen 중엔 스폰/이동 전부 멈춤, shimmer만 유지
    bonusEnemies.forEach(b => { if (b.active) b.shimmer += dt * 3; });
    // 파티클은 계속 업데이트
    updateBonusParticles(dt);
    return;
  }

  // 스폰 타이머
  bonusSpawnTimer -= dt;
  if (bonusSpawnTimer <= 0) {
    spawnBonusEnemy();
    bonusSpawnTimer = randomBonusInterval();
  }

  bonusEnemies.forEach(b => {
    if (!b.active) return;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.shimmer += dt * 3;
    if (b.x < -100 || b.x > canvas.width + 100 || b.y > canvas.height + 100) {
      b.active = false;
    }
  });
  bonusEnemies = bonusEnemies.filter(b => b.active);
  updateBonusParticles(dt);
}

function updateBonusParticles(dt) {
  bonusParticles.forEach(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.alpha = Math.max(0, p.life / p.maxLife);
  });
  bonusParticles = bonusParticles.filter(p => p.life > 0);
}

function spawnBonusParticles(x, y) {
  const colors = ['#ff9500', '#ffcc00', '#ff6a00', '#fff', '#ffaa44'];
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
    const speed = 80 + Math.random() * 140;
    bonusParticles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      alpha: 1,
      r: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}

export function drawBonusEnemies() {
  // 파티클 먼저
  bonusParticles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  bonusEnemies.forEach(b => {
    if (!b.active) return;
    const { x, y, size: s, shimmer } = b;
    ctx.save();
    ctx.shadowColor = '#ff9500';
    ctx.shadowBlur = 16 * (0.5 + 0.3 * Math.sin(shimmer));

    // 몸통 — UFO 스타일
    ctx.fillStyle = '#ff6a00';
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // 돔
    ctx.fillStyle = '#ffaa44';
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.1, s * 0.25, s * 0.2, 0, Math.PI, Math.PI * 2);
    ctx.fill();

    // 테두리
    ctx.strokeStyle = '#ffcc66';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();

    // ♥ 텍스트 힌트
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.floor(s * 0.35)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♥', x, y + s * 0.05);

    // 진행 표시 (3킬 중 몇 킬)
    const prog = bonusKillCount % BONUS_KILLS_FOR_HEART;
    if (prog > 0) {
      ctx.font = `bold 9px "Press Start 2P",monospace`;
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`${prog}/${BONUS_KILLS_FOR_HEART}`, x, y - s * 0.5);
    }

    ctx.restore();
  });
}

// ── Bonus Collision — returns {hit: bool, heartGained: bool} ──
export function checkBonusCollisions(currentLives) {
  let heartGained = false;
  let hitCount = 0;

  missiles.forEach(m => {
    if (!m.active) return;
    bonusEnemies.forEach(b => {
      if (!b.active) return;
      const dx = m.x - b.x, dy = m.y - b.y;
      if (Math.abs(dx) < b.size * 0.5 && Math.abs(dy) < b.size * 0.3) {
        m.active = false;
        b.active = false;
        spawnBonusParticles(b.x, b.y);
        bonusKillCount++;
        hitCount++;
        if (bonusKillCount % BONUS_KILLS_FOR_HEART === 0 && currentLives < MAX_LIVES) {
          heartGained = true;
        }
      }
    });
  });

  return { hit: hitCount > 0, heartGained };
}

export function getBonusKillCount() { return bonusKillCount; }

// ── Collision ──
export function checkCollisions() {
  const hits = [];
  missiles.forEach(m => {
    if (!m.active) return;
    enemies.forEach(e => {
      if (!e.active) return;
      if (m.x > e.x - e.width / 2 && m.x < e.x + e.width / 2 && m.y > e.y - e.height / 2 && m.y < e.y + e.height / 2) {
        m.active = false; e.active = false;
        hits.push(e.choiceIndex);
      }
    });
  });
  return hits;
}

// ── HUD ──
export function updateHUD(score, lives, qIndex, questions, correctCount, currentPlayer) {
  document.getElementById('ui-score').textContent = 'SCORE: ' + score;
  document.getElementById('ui-lives').textContent = '♥ '.repeat(lives).trim() || '💀';
  document.getElementById('ui-question-num').textContent = `Q ${qIndex + 1} / ${questions.length}`;
  document.getElementById('ui-level').textContent = '⚡x' + (Math.floor(correctCount / CONFIG.speedScalePerN) + 1);
  const n = document.getElementById('ui-player-name'); if (n) n.textContent = currentPlayer ? currentPlayer.toUpperCase() : '';
}

// ── Question Card ──
export function drawQuestionCard(question, qIndex, totalQ, readTimer) {
  const w = Math.min(canvas.width * 0.82, 720), h = Math.min(canvas.height * 0.55, 300);
  const cx = canvas.width / 2, cy = canvas.height / 2, x = cx - w / 2, y = cy - h / 2;
  ctx.save(); ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 40; ctx.fillStyle = 'rgba(0,15,40,0.97)'; rrect(ctx, x, y, w, h, 16); ctx.fill();
  ctx.shadowBlur = 0; ctx.strokeStyle = '#00f5ff'; ctx.lineWidth = 2; rrect(ctx, x, y, w, h, 16); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.font = 'bold 11px "Press Start 2P",monospace'; ctx.fillStyle = '#00f5ff'; ctx.textAlign = 'center';
  ctx.fillText(`QUESTION ${qIndex + 1} / ${totalQ}`, cx, y + 28);
  ctx.strokeStyle = 'rgba(0,245,255,0.2)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 24, y + 40); ctx.lineTo(x + w - 24, y + 40); ctx.stroke();
  ctx.fillStyle = '#ffffff';
  const fs = Math.max(13, Math.min(17, Math.floor(w / (question.prompt.length * 0.55)) + 8));
  ctx.font = `${fs}px Orbitron,monospace`;
  wrapTextCard(ctx, question.prompt, cx, cy - 10, w - 60, 24);
  ctx.font = '10px "Press Start 2P",monospace'; ctx.fillStyle = 'rgba(0,245,255,0.5)'; ctx.fillText('SPACE to skip', cx, y + h - 18); ctx.restore();
  const bw = w - 60, bh = 6, bx = x + 30, by = y + h - 36, prog = Math.max(0, readTimer / CONFIG.readDuration);
  const rv = Math.floor(255 * (1 - prog)), gv = Math.floor(255 * prog);
  ctx.save(); ctx.fillStyle = 'rgba(0,245,255,0.15)'; rrect(ctx, bx, by, bw, bh, 3); ctx.fill();
  if (bw * prog > 0) { ctx.fillStyle = `rgb(${rv},${gv},80)`; ctx.shadowColor = `rgb(${rv},${gv},80)`; ctx.shadowBlur = 8; rrect(ctx, bx, by, bw * prog, bh, 3); ctx.fill(); }
  ctx.font = 'bold 13px "Press Start 2P",monospace'; ctx.fillStyle = `rgb(${rv},${gv},80)`; ctx.shadowBlur = 12; ctx.textAlign = 'right';
  ctx.fillText(Math.ceil(readTimer) + 's', bx + bw, by - 6); ctx.restore();
}

// ── Utils ──
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
function wrapText(c, text, cx, cy, maxW) { const words = text.split(' '), lh = 14, fs = Math.min(13, Math.floor(maxW / (text.length * 0.55)) + 6); c.font = `${fs}px Orbitron,monospace`; c.textAlign = 'center'; let lines = [], line = ''; words.forEach(w => { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }); if (line) lines.push(line); const sy = cy - (lines.length * lh) / 2 + lh / 2; lines.forEach((l, i) => c.fillText(l, cx, sy + i * lh)); }
function wrapTextCard(c, text, cx, startY, maxW, lh) { const words = text.split(' '); let lines = [], line = ''; words.forEach(w => { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }); if (line) lines.push(line); const totalH = lines.length * lh; lines.forEach((l, i) => c.fillText(l, cx, startY - totalH / 2 + i * lh + lh)); }