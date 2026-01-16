# NC Building Contractor Practice Exam — Quiz App (local)

This is a **static (no-backend)** quiz app generated from your iSpring HTML export.

## What's included
- `index.html` — app UI
- `app.js` — quiz logic (Practice + Exam)
- `styles.css` — styling
- `questions.js` — embedded question bank (so you can open `index.html` directly)
- `questions.json` — same question bank in JSON form (handy if you want to import elsewhere)

## Run it
### Easiest
Just **double-click `index.html`** to open it in your browser.

### If you prefer a local server (optional)
**Windows (PowerShell in this folder):**

```powershell
python -m http.server 8000
```

Then open:
- http://localhost:8000

## Features
- Practice mode (instant feedback)
- Exam mode (timer, results at end)
- Shuffle questions + answers
- Flag questions
- Review missed/flagged
- Resume saved session (localStorage)

## Notes
- Everything is **local-only**: nothing is uploaded anywhere.
- If you want explanations, categories, or “weak areas” analytics, I can add those next.
