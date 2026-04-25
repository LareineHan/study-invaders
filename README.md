# 🚀 Study Invaders

> A retro space shooter where the enemies *are* your study material.

**[Created by Lareine Han](https://www.linkedin.com/in/lareinehan/)** · Featured by NAU AI Hub

---

## What Is This?

Study Invaders is a browser-based **Galaga-style arcade game** built for active recall studying. Instead of passive flashcards, you shoot down the correct answer before the wrong ones reach your ship.

The twist: **question sets are plain JSON files** — any student can generate a custom set using AI (ChatGPT, Claude, etc.), drop it into Google Drive, and start shooting.

---

## How to Play

| Input | Action |
|-------|--------|
| `← →` or drag (mobile) | Move ship |
| `Space` | Fire / Skip question card |
| Swipe down + release (mobile) | Slingshot fire |
| `Esc` | Quit menu |

A question appears at the top. Enemy blocks fall — each shows an answer choice. Shoot the **correct answer** before it hits the bottom. Wrong shots or misses cost a life.

**Bonus:** Shoot 3 UFOs → earn an extra life (max 5 lives).

---

## Game Flow

```
Start Screen
  ├── START GAME → Subject Select (Google Drive)
  │     └── Subject → Pack Select
  │           ├── ▶ PLAY (single pack)
  │           ├── ☑ Select multiple → PLAY SELECTED
  │           └── 📁 Subfolder → browse deeper
  └── 📂 LOAD LOCAL FILE → pick any .json → play immediately

After each pack:
  ├── 📋 REVIEW mistakes
  ├── ▶ CONTINUE → next pack
  └── ✕ FINISH → leaderboard
```

---

## File Structure

```
study-invaders/
├── index.html              # Game UI & screens
├── style.css               # Retro CRT visual style
├── game.js                 # Main orchestrator
├── manifest.json           # PWA manifest
├── service-worker.js       # PWA offline cache
├── README.md
├── docs/
│   ├── bgm.mp3             # Background music
│   ├── gameover.mp3        # Game over sound
│   ├── stageclear.mp3      # Stage clear sound
│   ├── icon.png            # App icon
│   ├── naulogo.png         # NAU logo
│   ├── studyinvaderslogo.png
│   └── screenshot01.png
├── modules/
│   ├── config.js           # STATE, CONFIG constants
│   ├── sound.js            # Sound engine + BGM
│   ├── leaderboard.js      # Google Sheets leaderboard
│   ├── review.js           # Wrong answer review
│   ├── drive.js            # Google Drive integration
│   └── gameplay.js         # Ship, enemies, canvas, HUD
└── questions/
    └── sample.json         # Fallback question set
```

---

## Google Drive — Question Pack Management

Course content lives in a shared Google Drive folder. No code changes needed to add or update packs.

### Folder Structure

```
Study Invaders/          ← Root folder (set ROOT_FOLDER in Apps Script)
├── BIO182/
│   ├── cell_respiration.json
│   └── genetics.json
├── CS249/
│   ├── sorting.json
│   └── Search Algorithms/   ← Subfolder supported
│       └── binary_search.json
└── MAT226/
    └── logic_sets.json
```

### Pack Selection UI

- Each folder shows its packs as a checklist
- Select individual packs or **SELECT ALL → PLAY SELECTED**
- Subfolders are browsable (📁)
- **PLAY ALL** plays every pack in the folder in order

---

## Creating Question Sets with AI

### Prompt Template

```
Create a Study Invaders question set for [YOUR SUBJECT / TOPIC].

Output ONLY valid JSON in exactly this format:

{
  "title": "Short descriptive title",
  "questions": [
    {
      "prompt": "Question text here?",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "answerIndex": 1,
      "explain": "One sentence explaining why this answer is correct."
    }
  ]
}

Rules:
- 10–20 questions
- 3–4 choices per question
- answerIndex is 0-based
- Keep choice text SHORT (under ~30 characters)
- Output raw JSON only
```

---

## Backend Setup

**Google Apps Script** acts as the API between the game and Google services.

| Action | What it does |
|--------|-------------|
| `subjects` | Lists course folders |
| `folder` | Lists subfolders + files in a folder |
| `file` | Returns JSON contents of a pack |
| `submit` | Saves a score to Google Sheets |
| `leaderboard` | Returns top 10 scores |

See `study_invaders_backend_docs.docx` for full setup instructions.

---

## PWA — Install as App

Study Invaders is a Progressive Web App. On mobile:

1. Open in Safari / Chrome
2. Tap **Share → Add to Home Screen**
3. Launches fullscreen like a native app

---

## Leaderboard

Scores saved automatically after each game to Google Sheets. Top 10 shown on the game over screen. Reset by deleting rows directly in Sheets.

---

## Difficulty Config

Edit `CONFIG` in `modules/config.js`:

```js
const CONFIG = {
  lives: 3,
  baseEnemySpeed: 55,
  speedScalePerN: 5,
  speedScaleAmount: 0.12,
  readDuration: 3.0,
  feedbackDuration: 2500,
};
```

---

## Tech Stack

Zero dependencies — plain HTML, CSS, Canvas API, Web Audio API.
No build step. No npm install. No framework.

**Backend:** Google Apps Script → Google Sheets + Google Drive.
All communication via GET requests (no CORS issues).

---

## License

MIT — free to use, modify, and distribute.

---

<div align="center">

**[Created by Lareine Han](https://www.linkedin.com/in/lareinehan/)**

*Featured by NAU AI Hub · Northern Arizona University*

</div>