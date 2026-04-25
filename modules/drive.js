import { SHEETS_URL } from './config.js';

export let levelQueue = [];
export let levelIndex = 0;
export let currentSubjectName = '';

export function setLevelIndex(i) { levelIndex = i; }
export function setLevelQueue(q) { levelQueue = q; }
export function clearLevelQueue() { levelQueue = []; levelIndex = 0; }

// ── 폴더 내용 가져오기 ──
async function fetchContents(folderId) {
  const res = await fetch(SHEETS_URL + '?action=folder&folderId=' + folderId + '&t=' + Date.now());
  return await res.json();
}

// ── 루트 과목 선택 화면 ──
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
        document.dispatchEvent(new CustomEvent('subject-selected', {
          detail: { id: btn.dataset.id, name: btn.dataset.name }
        }));
      });
    });
  } catch (e) {
    list.innerHTML = '<div class="lb-empty">Failed to load. Check connection.</div>';
  }
}

// ── 폴더 내용 화면 ──
export async function showFolderScreen(folderId, folderName) {
  currentSubjectName = folderName.replace(/_/g, ' ');

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-level').classList.add('active');
  document.getElementById('level-subject-title').textContent = currentSubjectName;

  const list = document.getElementById('level-list');
  list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1"><div class="spinner"></div></div>';

  try {
    const { folders, files } = await fetchContents(folderId);

    if (!folders.length && !files.length) {
      list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1">No packs found.</div>';
      return;
    }

    levelQueue = files;
    levelIndex = 0;

    // ── 서브폴더 버튼 ──
    const folderBtns = folders.map(f => `
      <button class="subject-btn folder-btn" data-id="${f.id}" data-name="${f.name}">
        <span class="subject-name">📁 ${f.name.replace(/_/g, ' ')}</span>
        <span class="badge">FOLDER ›</span>
      </button>`
    ).join('');

    // ── 파일 체크박스 카드 ──
    const fileBtns = files.length ? `
        ${files.map((f, i) => {
          const title = f.name.replace('.json','').replace(/^\d+_/,'').replace(/_/g,' ').toUpperCase();
          return `
            <label class="pack-row" data-index="${i}" style="
              display:flex;align-items:center;gap:0.9rem;
              background:rgba(10,10,40,0.85);border:1.5px solid #1a2a4a;border-radius:8px;
              padding:0.75rem 1rem;cursor:pointer;transition:border-color 0.15s;
            ">
              <input type="checkbox" class="pack-check" data-index="${i}" style="
                width:18px;height:18px;accent-color:var(--clr-primary);cursor:pointer;flex-shrink:0;
              "/>
              <span style="font-family:'Press Start 2P',monospace;font-size:0.45rem;
                color:#ddeeff;letter-spacing:0.06em;flex:1;">${title}</span>
              <button class="play-one-btn" data-index="${i}" style="
                font-family:'Press Start 2P',monospace;font-size:0.38rem;
                background:transparent;color:var(--clr-primary);
                border:1px solid var(--clr-primary);padding:0.4rem 0.7rem;
                border-radius:4px;cursor:pointer;flex-shrink:0;white-space:nowrap;
              ">▶ PLAY</button>
            </label>`;
        }).join('')}

        <div style="display:flex;gap:0.6rem;margin-top:0.4rem;flex-wrap:wrap;">
          <button id="btn-select-all" style="
            font-family:'Press Start 2P',monospace;font-size:0.38rem;
            background:transparent;color:var(--clr-dim);border:1px solid var(--clr-dim);
            padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;
          ">SELECT ALL</button>
          <button id="btn-select-none" style="
            font-family:'Press Start 2P',monospace;font-size:0.38rem;
            background:transparent;color:var(--clr-dim);border:1px solid var(--clr-dim);
            padding:0.4rem 0.8rem;border-radius:4px;cursor:pointer;
          ">CLEAR</button>
          <button id="btn-play-selected" style="
            font-family:'Press Start 2P',monospace;font-size:0.42rem;
            background:var(--clr-green);color:#000;border:none;
            padding:0.5rem 1rem;border-radius:4px;cursor:pointer;
            opacity:0.3;pointer-events:none;transition:opacity 0.15s;
          ">▶ PLAY SELECTED (<span id="selected-count">0</span>)</button>
  ` : '';

    list.innerHTML = `
      <div style="grid-column:1/-1;width:100%;display:flex;flex-direction:column;align-items:center;gap:0.6rem;">
        ${folderBtns}
        ${fileBtns}
      </div>`;

    // 체크박스 상태 업데이트
    function updatePlayBtn() {
      const checked = list.querySelectorAll('.pack-check:checked');
      const btn = document.getElementById('btn-play-selected');
      const count = document.getElementById('selected-count');
      if (!btn) return;
      count.textContent = checked.length;
      if (checked.length > 0) {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      } else {
        btn.style.opacity = '0.3';
        btn.style.pointerEvents = 'none';
      }
      // 선택된 카드 하이라이트
      list.querySelectorAll('.pack-row').forEach(row => {
        const cb = row.querySelector('.pack-check');
        row.style.borderColor = cb.checked ? 'var(--clr-primary)' : '#1a2a4a';
      });
    }

    // 체크박스 클릭
    list.querySelectorAll('.pack-check').forEach(cb => {
      cb.addEventListener('change', updatePlayBtn);
    });

    // 카드 클릭 = 체크박스 토글 (버튼 제외)
    list.querySelectorAll('.pack-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.play-one-btn') || e.target.type === 'checkbox') return;
        const cb = row.querySelector('.pack-check');
        cb.checked = !cb.checked;
        updatePlayBtn();
      });
    });

    // SELECT ALL / CLEAR
    document.getElementById('btn-select-all')?.addEventListener('click', () => {
      list.querySelectorAll('.pack-check').forEach(cb => cb.checked = true);
      updatePlayBtn();
    });
    document.getElementById('btn-select-none')?.addEventListener('click', () => {
      list.querySelectorAll('.pack-check').forEach(cb => cb.checked = false);
      updatePlayBtn();
    });

    // ▶ PLAY (단일)
    list.querySelectorAll('.play-one-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        levelIndex = parseInt(btn.dataset.index);
        // 단일 플레이 = 해당 팩만 queue에
        levelQueue = [files[levelIndex]];
        levelIndex = 0;
        document.dispatchEvent(new CustomEvent('level-selected', { detail: { index: 0 } }));
      });
    });

    // ▶ PLAY SELECTED
    document.getElementById('btn-play-selected')?.addEventListener('click', () => {
      const checked = [...list.querySelectorAll('.pack-check:checked')];
      if (!checked.length) return;
      // 체크된 순서(위→아래) 그대로 queue 구성
      levelQueue = checked.map(cb => files[parseInt(cb.dataset.index)]);
      levelIndex = 0;
      document.dispatchEvent(new CustomEvent('level-selected', { detail: { index: 0 } }));
    });

    // 서브폴더 클릭
    list.querySelectorAll('.folder-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        list.querySelectorAll('.subject-btn').forEach(b => b.disabled = true);
        btn.innerHTML = `<span class="subject-name">LOADING</span><div class="spinner"></div>`;
        showFolderScreen(btn.dataset.id, btn.dataset.name);
      });
    });

  } catch (e) {
    console.error(e);
    list.innerHTML = '<div class="lb-empty" style="grid-column:1/-1">Failed to load packs.</div>';
  }
}

// 하위 호환
export async function startSubject(folderId, subjectName) {
  await showFolderScreen(folderId, subjectName);
}

// ── 팩 로드 ──
export async function loadLevelByIndex(idx, autoAdvance = false) {
  const level = levelQueue[idx];
  if (!level) return;
  try {
    const res = await fetch(SHEETS_URL + '?action=file&fileId=' + level.id + '&t=' + Date.now());
    const data = await res.json();
    if (!data.questions || !Array.isArray(data.questions)) throw new Error('bad format');

    const title = level.name.replace('.json', '').replace(/^\d+_/, '').replace(/_/g, ' ');
    const setName = currentSubjectName + ' — ' + title;

    document.dispatchEvent(new CustomEvent('level-loaded', {
      detail: { questions: data.questions, setName, autoAdvance }
    }));
  } catch (e) {
    alert('Failed to load pack. Check JSON format.');
  }
}