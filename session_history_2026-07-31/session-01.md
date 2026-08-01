# Session 01 — 2026-07-31

First session. Went from nothing to a deployed, installable on-device app.

## What was decided

**This is a wrapper around an existing model, not a model trained from scratch.** Named early so the
rest of the design aimed at the right target. The personalization effect the project wants comes from
a profile + conversation memory injected into context, not from training weights.

**The instrument is an organ, not a piano.** The Kawai XR7000 is a home/theatre organ — drawbars,
upper/lower manuals, bass pedalboard, auto-rhythm/accompaniment, Leslie simulation. All advice and
practice tasks are grounded in that, never generic digital-piano material.

**Hosting: the model runs on the phone.** Considered a DGX Spark over Tailscale, a hosted API, and a
hybrid. Chose fully on-device so the app works anytime without a server being powered on. The Spark/
Ollama backend still exists but is now the optional dev-and-comparison path.

**Fine-tuning was corrected and deferred.** The user believed the Spark was for one-time fine-tuning,
after which the model would be portable. Not how it works: inference runs on every message and never
goes away, and a fine-tuned 70B is still 70B — it will not fit a phone. Fine-tuning is also a poor
mechanism for remembering facts about a person (that is `profile.json`, which updates instantly and
is hand-editable). Fine-tuning remains worthwhile later for *style*, and the conversation logs being
saved now are exactly the training data it would need.

**GitHub Pages for hosting.** WebGPU and service workers both require a secure context, so serving
from `http://192.168.x.x:8000` to a phone would fail. The on-device app is pure static files, so
Pages gives free HTTPS and a permanent URL — which also happens to be the cleanest answer to "usable
anytime without the Spark".

## The central architectural rule

An on-device model is limited to roughly 1–3B parameters on iPhone. That size **cannot be trusted to
derive music theory** — it will state wrong chord tones and wrong mode formulas fluently. For a
learner who cannot yet catch the error, that is the worst possible failure mode.

So the model never does theory. `frontend/music-theory.js` computes it exactly, in code, and the
result is handed to the model as a VERIFIED FACTS block that it is instructed to treat as ground
truth. The model's only job is to explain and converse.

A useful side effect: the app is still valuable with no model loaded at all, because the theory
engine answers instantly and correctly on its own.

**Preserve this split in all future work.**

## What was built

| Area | Files |
| --- | --- |
| Theory engine (deterministic) | `frontend/music-theory.js`, `music-theory.test.js` |
| English → theory extraction | `frontend/theory-context.js`, `theory-context.test.js` |
| On-device model (WebLLM/WebGPU) | `frontend/llm-engine.js` |
| Browser-side memory | `frontend/local-memory.js` |
| PWA shell | `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js` |
| Optional server path | `backend/` (FastAPI + Ollama) |
| Deployment | `.github/workflows/pages.yml` |

63 tests, all passing. The workflow runs them before every deploy, so a broken theory engine cannot
reach the phone.

## Bugs the tests actually caught

1. **Wrong enharmonic spelling.** The naive implementation spelled C minor as `C D# G A#`. Fixed by
   spelling notes by letter-and-accidental (a 3rd is always two letter names up), which also makes
   A harmonic minor end on `G#` and B°7 give `Ab`. This is exactly the class of error the whole
   architecture exists to prevent, so it was worth catching in code rather than in a lesson.
2. **Progression order was being scrambled.** `detectChords` grouped qualified chords ahead of bare
   ones, so "C Am F G" reached the analyzer as "Am C F G". Order carries musical meaning; fixed to
   preserve the sequence as played.
3. **Chord detection vs. English.** "I am not sure", "that is a good idea" must not parse as Am / A.
   Solved by requiring an uppercase root, plus a rule that bare single letters only count when the
   message looks like it lists a progression. Tested explicitly.

## Environment notes

- Node.js v24.18.1 installed via winget this session — was not present on this machine before.
- Python is available as `py`, **not** as `python` (the `python` alias hits the Microsoft Store stub).
- Git had no global identity; set repo-locally to `Lukaisensee` with the GitHub **noreply** email, so
  the public repo does not publish a personal address.

## State at end of session

Deployed and ready to test on iPhone. Repo: https://github.com/LukaIsensee/xr7000-music-teacher

## Next session

1. **Test on the iPhone first** and report what actually happened — whether WebGPU was present,
   whether the 1B model loaded, and how long it took. That result decides everything below.
2. If 1B loads comfortably, try Qwen 2.5 1.5B for noticeably better answers.
3. Judge answer quality against the profile: is it using the XR7000's actual features, and is it
   pitched at the right skill level?
4. Known gap: automatic profile learning is deliberately minimal on-device. Only feeling-words are
   captured, because a 1B model is not reliable at extracting structured JSON, and a wrong profile
   compounds over time. The profile is hand-editable in the UI as the honest interim answer. Revisit
   once real usage shows what it actually needs to learn.
5. Skill level is still `null` — worth setting, since it changes how every practice task is pitched.
