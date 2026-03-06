# 🚀 Study Invaders

> **NAU AI Hub — Experimental Learning Project**
> A retro space shooter where the enemies *are* your study material.

---

## What Is This?

Study Invaders is a browser-based **Galaga-style arcade game** built for active recall studying. Instead of passive flashcards, you shoot down the correct answer before the wrong ones reach your ship.

The twist: **question sets are plain JSON files** — any student can generate a custom set using AI (ChatGPT, Claude, etc.), drop it into Google Drive, and start shooting.

This project lives in the **NAU AI Hub** as an experiment in:
- AI-assisted content creation (students generate their own question sets)
- Community-driven learning (shared leaderboard across all players)
- Rapid iteration based on student feedback

---

## Quick Start

### Run Locally

```bash
git clone https://github.com/YOUR_USERNAME/study-invaders.git
cd study-invaders

# Python
python3 -m http.server 8080

# OR Node
npx serve .
```

Open `http://localhost:8080`.

### Publish (GitHub Pages)

1. Push to a GitHub repo
2. **Settings → Pages → Source: main / (root)**
3. Live at `https://YOUR_USERNAME.github.io/study-invaders/`

---

## How to Play

| Key | Action |
|-----|--------|
| `← →` | Move ship |
| `Space` | Fire / Skip question card |
| `Esc` | Quit menu |
| `Enter` | Confirm / Start |

A question appears at the top. Enemy blocks fall — each shows an answer choice. Shoot the **correct answer** before it hits the bottom. Wrong shots or misses cost a life. Three lives total.

---

## Game Flow

```
Start Screen
  ├── START GAME → Subject Select (Google Drive)
  │     └── Subject → Level Select → Level 1 → Level 2 → ... → Course Complete!
  └── 📂 LOAD LOCAL FILE → pick any .json → play immediately
```

- Enter your name before the first level — stays for the whole session
- Clear a level → prompted to **Continue** to next level or **Finish**
- Scores saved to shared leaderboard (Google Sheets)

---

## File Structure

```
study-invaders/
├── index.html          # Game UI & screens
├── style.css           # Retro CRT visual style
├── game.js             # All game logic
├── README.md
├── docs/
│   ├── naulogo.png     # NAU logo
│   └── screenshot01.png
└── questions/
    └── sample.json     # Fallback question set
```

---

## Google Drive — Question Set Management

Course content lives in a shared Google Drive folder. No code changes needed to add or update questions.

### Folder Structure

```
Study Invaders/                  ← Root folder
├── BIO182/
│   ├── 01_cell_respiration.json
│   ├── 02_dna_replication.json
│   └── 03_genetics.json
├── CS136/
│   ├── 01_pointers.json
│   └── 02_memory.json
└── DISCRETE_MATH/
    └── 01_logic_sets.json
```

### Naming Convention

Files must be prefixed with a number to control play order:

```
01_topic_name.json   →   LEVEL 1 — Topic Name
02_next_topic.json   →   LEVEL 2 — Next Topic
```

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
- 10–25 questions
- 3–4 choices per question
- answerIndex is 0-based (0 = first choice)
- Keep choice text SHORT (under ~40 characters)
- Focus on commonly confused or tricky concepts
- Output raw JSON only, no extra text
```

### Adding to Drive

1. Save AI output as `XX_topic.json` (e.g. `03_genetics.json`)
2. Drop into the correct subject folder in Google Drive
3. Appears in game immediately — no code changes needed

---

## Leaderboard

Scores are saved automatically to a shared Google Sheets leaderboard after every game. Top 10 displayed on the game over screen.

**Weekly reset** — Hub admin deletes rows directly in Google Sheets.

---

## Question Set Format Reference

```json
{
  "title": "Human-readable title",
  "questions": [
    {
      "prompt": "What does LIFO stand for?",
      "choices": [
        "Last In, First Out",
        "Last In, First Over",
        "List In, Function Out",
        "Linear Input, First Output"
      ],
      "answerIndex": 0,
      "explain": "LIFO = Last In First Out — like a stack of plates."
    }
  ]
}
```

- `choices` → 2–4 items (4 recommended)
- `answerIndex` → 0-based index
- `explain` → optional, shown after correct answer
- Keep choice text under ~50 characters

---

## Difficulty Config

Edit `CONFIG` at the top of `game.js`:

```js
const CONFIG = {
  lives: 3,
  baseEnemySpeed: 55,      // px/sec
  speedScalePerN: 5,       // correct answers per speed increase
  speedScaleAmount: 0.12,  // 12% faster each time
  readDuration: 3.0,       // seconds to read question card
  feedbackDuration: 1800,  // ms to show feedback
};
```

---

## Technical Notes

Zero dependencies — plain HTML, CSS, JavaScript Canvas. No build step, no npm install.
Sound effects generated with Web Audio API (no audio files).

**Backend:** Google Apps Script web app → Google Sheets (leaderboard) + Google Drive (question sets). Static frontend communicates via GET requests to avoid CORS issues.

---

## License

MIT — free to use, modify, and distribute.

---

*Built by Lareine Han · NAU AI Hub*
