import { SHEETS_URL } from './config.js';

export async function lbSubmit(name, score, questionSet) {
  try {
    const url = SHEETS_URL
      + "?action=submit"
      + "&name=" + encodeURIComponent(name)
      + "&score=" + encodeURIComponent(score)
      + "&questionSet=" + encodeURIComponent(questionSet || "unknown");
    await fetch(url);
  } catch (e) { console.warn("Score submit failed:", e); }
}

export async function lbFetch() {
  try {
    const res = await fetch(SHEETS_URL + "?action=leaderboard&t=" + Date.now());
    return await res.json();
  } catch (e) { console.warn("Leaderboard fetch failed:", e); return []; }
}

export function lbRender(highlightName, entries) {
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
