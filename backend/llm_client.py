"""Thin client for a local Ollama server (e.g. running on a DGX Spark)."""
import json
import os
import re

import requests

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
MODEL_NAME = os.environ.get("MODEL_NAME", "llama3.3:70b")
REQUEST_TIMEOUT = float(os.environ.get("LLM_TIMEOUT_SECONDS", "120"))


class LLMError(RuntimeError):
    pass


def chat(messages: list[dict], temperature: float = 0.7) -> str:
    """Send a full messages array (system + history + user turn) to Ollama
    and return the assistant's reply text."""
    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={
                "model": MODEL_NAME,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature},
            },
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise LLMError(
            f"Could not reach Ollama at {OLLAMA_BASE_URL} with model '{MODEL_NAME}': {exc}"
        ) from exc

    data = resp.json()
    try:
        return data["message"]["content"]
    except (KeyError, TypeError) as exc:
        raise LLMError(f"Unexpected response shape from Ollama: {data}") from exc


CONSOLIDATION_SYSTEM_PROMPT = """You maintain a student profile for a personalized music teacher app.
Read the recent conversation between the teacher (assistant) and the student (user) and extract
ONLY genuinely new, durable facts worth remembering long-term: the student's skill level, musical
taste, and any personal vocabulary they use to describe music (e.g. emotional or descriptive words)
along with what that word seems to mean to them musically.

Respond with ONLY a JSON object, no prose, no markdown fences, matching this shape exactly:
{
  "skill_level": "<string or null if unchanged/unknown>",
  "new_goals": ["<string>", ...],
  "new_taste_notes": ["<string>", ...],
  "new_vocabulary": {"<term>": ["<musical meaning>", ...], ...}
}
If nothing new was learned, return empty lists/objects and null for skill_level. Do not repeat
facts that are obvious restatements of prior turns."""


def consolidate_profile_updates(recent_messages: list[dict]) -> dict:
    """Ask the model to extract profile updates from recent conversation.
    Best-effort: returns an empty updates dict on any parsing failure."""
    empty = {"skill_level": None, "new_goals": [], "new_taste_notes": [], "new_vocabulary": {}}
    if not recent_messages:
        return empty

    transcript = "\n".join(f"{m['role']}: {m['content']}" for m in recent_messages)
    messages = [
        {"role": "system", "content": CONSOLIDATION_SYSTEM_PROMPT},
        {"role": "user", "content": transcript},
    ]
    try:
        raw = chat(messages, temperature=0.0)
    except LLMError:
        return empty

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return empty
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return empty

    for key, default in empty.items():
        parsed.setdefault(key, default)
    return parsed
