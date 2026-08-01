# XR7000 Music Teacher — Step 1

A private, personalized AI music teacher for the Kawai XR7000, built in phases.

## Roadmap

- **Step 1 (this)**: text chat teacher. Generates detailed practice tasks, translates your
  descriptive/emotional language ("more sorrowful") into concrete music-theory suggestions, and
  remembers your skill level, taste, and personal vocabulary across sessions via a profile that
  updates itself in the background as you talk. PWA so it installs on your phone too.
- **Step 2**: refine the interpretation/vocabulary layer and practice-task quality based on real
  usage; expand the profile model.
- **Step 3**: microphone input — hear chords/notes as you play the XR7000 and give live feedback
  and analysis, answering questions about where to go next based on what it just heard.

## Architecture

- `backend/` — FastAPI app. Talks to a local Ollama server over HTTP (`/api/chat`), so the LLM
  itself runs on your DGX Spark, not in this app.
- `frontend/` — installable PWA chat UI (vanilla HTML/CSS/JS, no build step).
- `data/` — `conversations.db` (SQLite message history) and `profile.json` (evolving profile:
  skill level, goals, taste notes, personal vocabulary mappings). Both are gitignored — this is
  *your* data, not something to commit.

Python was chosen for the backend specifically because Step 3 (audio analysis) will need Python's
audio/DSP ecosystem (librosa, aubio, crepe, etc.) — this avoids a rewrite later.

## Setup

1. On the machine running Ollama (your DGX Spark):
   ```
   ollama pull llama3.3:70b     # or: ollama pull qwen2.5:72b
   OLLAMA_HOST=0.0.0.0 ollama serve
   ```
2. Wherever you run this app (can be the same Spark, or another machine on your LAN):
   ```
   python -m venv .venv
   .venv/Scripts/activate        # Windows
   pip install -r requirements.txt
   copy .env.example .env        # then edit OLLAMA_BASE_URL to point at the Spark's LAN IP
   ```
3. Run it:
   ```
   cd backend
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
4. Open `http://<this-machine's-LAN-IP>:8000` in a browser — on your phone too, then
   "Add to Home Screen" to install it as an app.

## Notes

- The "Profile" button in the header shows exactly what the app currently believes about you —
  useful for sanity-checking that it's learning the right things, and you can hand-edit
  `data/profile.json` directly at any time if it gets something wrong.
- Profile updates happen as a background task every few messages, so replies aren't slowed down
  by the extra consolidation call.
