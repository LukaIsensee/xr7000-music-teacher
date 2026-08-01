# XR7000 Music Teacher — Step 1

A private, personalized AI music teacher for the Kawai XR7000, built in phases.

## Roadmap

- **Step 1 (this)**: text chat teacher. Generates detailed practice tasks, translates your
  descriptive/emotional language ("more sorrowful") into concrete music-theory suggestions, and
  remembers your skill level, taste, and personal vocabulary across sessions via a profile that
  updates itself in the background as you talk. PWA so it installs on your phone too.
- **Step 2**: move the model on-device (WebLLM/WebGPU) so the app works on the phone without a
  server, backed by the deterministic theory engine below. Refine the interpretation/vocabulary
  layer and practice-task quality from real usage.
- **Step 3**: microphone input — hear chords/notes as you play the XR7000 and give live feedback
  and analysis, answering questions about where to go next based on what it just heard.

## Architecture

The target is a model running **on the phone itself**, so the app works anywhere without depending
on a server being powered on.

That constrains the model to roughly 1–4B parameters, which is too small to reliably *derive* music
theory — a small model will state wrong chord tones and wrong mode formulas fluently, which is the
worst possible failure mode for a learner. So the design splits the job:

- `frontend/music-theory.js` — **deterministic theory engine, no LLM involved.** Chord spelling,
  scales/modes, diatonic harmony, roman-numeral analysis, and mood-to-device suggestions are all
  computed exactly in code. Notes are spelled by letter-and-accidental (a 3rd is always two letter
  names up), so C minor yields `Eb` not `D#`, and A harmonic minor ends on `G#` not `Ab`.
- `frontend/music-theory.test.js` — 38 assertions covering the above. Run with
  `node frontend/music-theory.test.js`. These matter: the engine's correctness is the entire reason
  the small model is safe to teach with.
- The language model's job is only to *converse* — explain the verified facts it is handed, in your
  vocabulary, at your level. It is never asked to work out the theory itself.
- `frontend/` — installable PWA chat UI (vanilla HTML/CSS/JS, no build step).
- `backend/` — FastAPI app talking to Ollama. Now the **optional** path: useful for development and
  for comparing answers against a large model on a DGX Spark, but not required for the on-device
  target.
- `data/` — `conversations.db` (SQLite message history) and `profile.json` (evolving profile:
  skill level, goals, taste notes, personal vocabulary mappings). Both are gitignored — this is
  *your* data, not something to commit.

### On fine-tuning

Fine-tuning is planned, but it is worth being precise about what it does. It will **not** remove the
need for a model to run somewhere, and it will **not** shrink a model to phone size — a fine-tuned
70B is still 70B. Fine-tuning is also a poor mechanism for *remembering facts about you*: it needs
many examples and would have to be re-run every time it learned something new. That job belongs to
`profile.json`, which updates instantly and can be hand-corrected.

Where fine-tuning genuinely helps is **style** — making the teacher sound the way you want, adopt
your idiom, and land on the right level of detail unprompted. The conversation logs being saved now
are exactly the training data that step will need.

## Session history

Every working session is logged to `session_history_YYYY-MM-DD/session-NN.md` — decisions made,
what was built, and what to pick up next time. Read the most recent one before resuming work.

## Using it on an iPhone

The deployed app needs no server. Open the GitHub Pages URL in **Safari** (Chrome and Firefox on iOS
cannot do WebGPU), then Share > Add to Home Screen to install it.

- **iOS 26+**: WebGPU is on by default.
- **Older iOS**: enable Settings > Safari > Advanced > Feature Flags > WebGPU.
- First load downloads roughly 1 GB of model weights — do it on Wi-Fi. After that it works offline.
- Start with the 1B model. It is the one most likely to fit inside Safari's per-tab memory limit;
  the 3B option gives better answers but may fail on a phone.

If the model won't load, the app still works: the theory engine is exact and needs no model at all.

## Local development

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
