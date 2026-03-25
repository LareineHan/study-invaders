import { SHEETS_URL } from './config.js';

export let levelQueue = [];
export let levelIndex = 0;
export let currentSubjectName = '';

export function setLevelIndex(i) { levelIndex = i; }
export function setLevelQueue(q) { levelQueue = q; }
export function clearLevelQueue() { levelQueue = []; levelIndex = 0; }

export async function showSubjectScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-subject').classList.add('active');
  const list = document.getElementById('subject-list');
  list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1"><div class="spinner"></div></div>';

  try {
    const res = await fetch(SHEETS_URL + '?action=subjects&t=' + Date.now());
    const subjects = await res.json();
    if (!subjects.length) {
      list.innerHTML = '<div class="lb-empty">No subjects found in Drive.</div>';
      return;
    }
    list.innerHTML = subjects.map(s =>
      `<button class="subject-btn" data-id="${s.id}" data-name="${s.name}">
        <span class="subject-name">${s.name.replace(/_/g, ' ')}</span>
        <span class="badge">${s.levels} PACK${s.levels > 1 ? 'S' : ''}</span>
      </button>`
    ).join('');

    list.querySelectorAll('.subject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        list.querySelectorAll('.subject-btn').forEach(b => b.disabled = true);
        btn.innerHTML = `<span class="subject-name">LOADING</span><div class="spinner"></div>`;
        // dispatches to game.js via custom event
        document.dispatchEvent(new CustomEvent('subject-selected', {
          detail: { id: btn.dataset.id, name: btn.dataset.name }
        }));
      });
    });
  } catch (e) {
    list.innerHTML = '<div class="lb-empty">Failed to load. Check connection.</div>';
  }
}

export async function startSubject(folderId, subjectName) {
  currentSubjectName = subjectName.replace(/_/g, ' ');
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-level').classList.add('active');
  document.getElementById('level-subject-title').textContent = currentSubjectName;

  const list = document.getElementById('level-list');
  list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1"><div class="spinner"></div></div>';

  try {
    const res = await fetch(SHEETS_URL + '?action=levels&folderId=' + folderId + '&t=' + Date.now());
    levelQueue = await res.json();
    if (!levelQueue.length) {
      list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1">No packs found.</div>';
      return;
    }
    list.innerHTML = levelQueue.map((l, i) => {
      const raw = l.name.replace('.json', '');
      const title = raw.replace(/^\d+_/, '').replace(/_/g, ' ').toUpperCase();
      return `<button class="subject-btn" data-index="${i}">
        <span class="subject-name">${title}</span>
        <span class="badge">▶ START</span>
      </button>`;
    }).join('');

    list.querySelectorAll('.subject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        list.querySelectorAll('.subject-btn').forEach(b => b.disabled = true);
        btn.innerHTML = `<span class="subject-name">LOADING</span><div class="spinner"></div>`;
        levelIndex = parseInt(btn.dataset.index);
        document.dispatchEvent(new CustomEvent('level-selected', {
          detail: { index: levelIndex }
        }));
      });
    });
  } catch (e) {
    list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1">Failed to load packs.</div>';
  }
}

export async function loadLevelByIndex(idx, autoAdvance = false) {
  const level = levelQueue[idx];
  try {
    const res = await fetch(SHEETS_URL + '?action=file&fileId=' + level.id + '&t=' + Date.now());
    const data = await res.json();
    if (!data.questions || !Array.isArray(data.questions)) throw new Error('bad format');

    const raw = level.name.replace('.json', '');
    const title = raw.replace(/^\d+_/, '').replace(/_/g, ' ');
    const setName = currentSubjectName + ' — ' + title;

    document.dispatchEvent(new CustomEvent('level-loaded', {
      detail: { questions: data.questions, setName, autoAdvance }
    }));
  } catch (e) {
    alert('Failed to load pack ' + (idx + 1) + '. Check JSON format.');
  }
}
