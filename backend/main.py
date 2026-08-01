"""FastAPI app: personalized Kawai XR7000 / music teacher chat backend."""
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import llm_client
import memory

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
HISTORY_WINDOW = 20
CONSOLIDATE_EVERY_N_MESSAGES = 6

app = FastAPI(title="XR7000 Music Teacher")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    memory.init_db()
    memory.load_profile()  # creates default profile.json on first run


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


def build_system_prompt(profile: dict) -> str:
    instrument = profile["instrument"]
    skill_level = profile.get("skill_level") or "unknown — ask the student early on, then remember it"
    goals = "\n".join(f"- {g}" for g in profile.get("goals", []))
    taste_notes = "\n".join(f"- {n}" for n in profile["taste"].get("notes", [])) or "(none recorded yet)"
    vocab_lines = []
    for term, meanings in profile.get("vocabulary_map", {}).items():
        meanings_str = "; ".join(meanings)
        vocab_lines.append(f'- "{term}" tends to mean: {meanings_str}')
    vocab_block = "\n".join(vocab_lines) or "(none learned yet)"

    return f"""You are a private, one-on-one music teacher for a single specific student, teaching them
to play their instrument and understand music generally. You are Step 1 of a larger planned system:
later phases will let you *hear* the student's playing via microphone and give real-time analysis.
For now you cannot hear anything — you only have this text conversation and what you remember about
the student. Never claim to have heard audio.

INSTRUMENT
The student's instrument is a {instrument['model']} ({instrument['type']}). It has: {', '.join(instrument['features'])}.
Ground every exercise and suggestion in what this instrument can actually do — drawbar registrations,
splitting hands across manuals, pedal-bass technique, using or deliberately avoiding the auto-rhythm/
accompaniment section, Leslie speed changes for expression. Do not default to generic "digital piano"
advice (e.g. sustain pedal technique) unless it's actually applicable.

STUDENT PROFILE (update your mental model as you learn more; the app also stores this between sessions)
Skill level: {skill_level}
Goals:
{goals}
Taste notes:
{taste_notes}
Personal vocabulary — words this student uses for music, and what they seem to mean by them:
{vocab_block}

HOW TO TEACH THIS STUDENT
1. When the student describes what they want in feeling/vocabulary terms (e.g. "I need it to move to
   a more sorrowful place"), translate that into concrete, specific musical options: actual chords
   given their current progression/key, scale/mode choices (e.g. "try Dorian here for more flavor"),
   voicing or registration changes. Give a reason, not just a label. If you're inferring what a word
   means for them and it's not yet in their vocabulary above, say so plainly and treat it as a
   hypothesis to confirm, not a fact.
2. When asked for practice, generate DETAILED tasks: specific keys/chords/registrations/pedal
   patterns, a clear goal for the exercise, how long/how many reps, and a concrete way to tell if it
   went well. Calibrate difficulty to the student's actual skill level above — don't default to
   generic beginner material once you know they're past that.
3. Ask clarifying questions when the student's request is ambiguous rather than guessing silently.
4. Be honest about the current limitation (no audio yet) rather than pretending to assess their
   playing. If they describe what they played, work from their description.
5. Keep responses tailored to this one student's taste and vocabulary, not generic music-teacher
   boilerplate."""


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest, background_tasks: BackgroundTasks) -> ChatResponse:
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    profile = memory.load_profile()
    system_prompt = build_system_prompt(profile)
    history = memory.get_recent_messages(HISTORY_WINDOW)

    messages = [{"role": "system", "content": system_prompt}] + history + [
        {"role": "user", "content": req.message}
    ]

    try:
        reply = llm_client.chat(messages)
    except llm_client.LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    memory.add_message("user", req.message)
    memory.add_message("assistant", reply)

    if memory.total_message_count() % CONSOLIDATE_EVERY_N_MESSAGES == 0:
        background_tasks.add_task(run_consolidation)

    return ChatResponse(reply=reply)


def run_consolidation() -> None:
    recent = memory.get_recent_messages(CONSOLIDATE_EVERY_N_MESSAGES)
    updates = llm_client.consolidate_profile_updates(recent)
    memory.merge_profile_updates(updates)


@app.get("/api/profile")
def get_profile() -> dict:
    return memory.load_profile()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model": llm_client.MODEL_NAME, "ollama": llm_client.OLLAMA_BASE_URL}


app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
