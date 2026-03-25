// Tracks wrong answers during a game session
let wrongAnswers = [];

export function resetReview() {
  wrongAnswers = [];
}

export function recordWrong({ prompt, choices, answerIndex, myChoiceIndex, explain }) {
  wrongAnswers.push({
    prompt,
    correct: choices[answerIndex],
    mine: choices[myChoiceIndex] ?? '(missed)',
    explain: explain || '',
  });
}

export function hasWrongAnswers() {
  return wrongAnswers.length > 0;
}

export function showReviewOverlay() {
  const existing = document.getElementById('overlay-review');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'overlay-review';
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,5,20,0.97);
    display:flex;flex-direction:column;align-items:center;
    z-index:400;overflow-y:auto;padding:2rem 1rem;
  `;

  const header = `
    <div style="font-family:'Press Start 2P',monospace;font-size:clamp(0.6rem,1.5vw,0.85rem);
      color:#ff4466;letter-spacing:0.12em;margin-bottom:0.5rem;">📋 REVIEW — MISSED QUESTIONS</div>
    <div style="font-family:'Orbitron',monospace;font-size:0.75rem;color:#3a5a7a;
      margin-bottom:1.5rem;">${wrongAnswers.length} question${wrongAnswers.length>1?'s':''} to review</div>
  `;

  const cards = wrongAnswers.map((w, i) => `
    <div style="
      background:#040d1f;border:1px solid #1a2a4a;border-radius:10px;
      padding:1.2rem 1.4rem;margin-bottom:1rem;
      width:min(640px,90vw);text-align:left;
    ">
      <div style="font-family:'Orbitron',monospace;font-size:0.65rem;color:#3a5a7a;
        margin-bottom:0.5rem;">Q${i+1}</div>
      <div style="font-family:'Orbitron',monospace;font-size:0.85rem;color:#ddeeff;
        margin-bottom:0.9rem;line-height:1.5;">${w.prompt}</div>
      <div style="display:flex;flex-direction:column;gap:0.4rem;margin-bottom:0.8rem;">
        <div style="font-family:'Orbitron',monospace;font-size:0.72rem;">
          <span style="color:#ff4466;">❌ Your answer: </span>
          <span style="color:#ff8899;">${w.mine}</span>
        </div>
        <div style="font-family:'Orbitron',monospace;font-size:0.72rem;">
          <span style="color:#39ff14;">✅ Correct: </span>
          <span style="color:#aaffaa;">${w.correct}</span>
        </div>
      </div>
      ${w.explain ? `
        <div style="
          border-top:1px solid #1a2a4a;padding-top:0.7rem;
          font-family:'Orbitron',monospace;font-size:0.68rem;
          color:#7aaacc;line-height:1.6;
        ">💡 ${w.explain}</div>
      ` : ''}
    </div>
  `).join('');

  const closeBtn = `
    <button id="btn-review-close" style="
      margin-top:1rem;font-family:'Press Start 2P',monospace;font-size:0.5rem;
      background:transparent;color:#00f5ff;border:2px solid #00f5ff;
      padding:0.8rem 1.6rem;cursor:pointer;border-radius:6px;letter-spacing:0.08em;
    ">← BACK TO RESULTS</button>
  `;

  overlay.innerHTML = header + cards + closeBtn;
  document.body.appendChild(overlay);

  document.getElementById('btn-review-close').addEventListener('click', () => {
    overlay.remove();
  });
}
