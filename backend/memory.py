"""Persistence layer: conversation history (SQLite) and evolving user profile (JSON)."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "conversations.db"
PROFILE_PATH = DATA_DIR / "profile.json"

DEFAULT_PROFILE = {
    "instrument": {
        "model": "Kawai XR7000",
        "type": "home/theatre organ",
        "features": [
            "multiple manuals (upper/lower)",
            "drawbars",
            "pedalboard (bass pedals)",
            "auto-rhythm/accompaniment styles",
            "Leslie speaker simulation",
            "General MIDI",
        ],
    },
    "skill_level": None,
    "goals": [
        "learn to play the Kawai XR7000 well",
        "improve general music understanding",
        "eventually get real-time audio feedback on playing (future phase)",
    ],
    "taste": {"notes": []},
    "vocabulary_map": {
        "sorrowful": [
            "minor key, e.g. Am if it fits the current progression",
            "Dorian or Aeolian mode for a wistful/open color",
            "softer drawbar registration, slower rhythm/tempo",
        ]
    },
    "session_count": 0,
    "last_updated": None,
}


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    _ensure_data_dir()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def add_message(role: str, content: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO messages (ts, role, content) VALUES (?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), role, content),
        )
        conn.commit()
    finally:
        conn.close()


def get_recent_messages(limit: int = 20) -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            "SELECT role, content FROM messages ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    finally:
        conn.close()
    rows.reverse()
    return [{"role": role, "content": content} for role, content in rows]


def total_message_count() -> int:
    conn = sqlite3.connect(DB_PATH)
    try:
        (count,) = conn.execute("SELECT COUNT(*) FROM messages").fetchone()
    finally:
        conn.close()
    return count


def load_profile() -> dict:
    _ensure_data_dir()
    if not PROFILE_PATH.exists():
        save_profile(DEFAULT_PROFILE)
        return json.loads(json.dumps(DEFAULT_PROFILE))
    with open(PROFILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_profile(profile: dict) -> None:
    _ensure_data_dir()
    profile["last_updated"] = datetime.now(timezone.utc).isoformat()
    with open(PROFILE_PATH, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)


def merge_profile_updates(updates: dict) -> dict:
    """Merge a partial updates dict (as produced by the LLM consolidation
    step) into the stored profile, without discarding existing data."""
    profile = load_profile()

    skill_level = updates.get("skill_level")
    if skill_level:
        profile["skill_level"] = skill_level

    for goal in updates.get("new_goals", []) or []:
        if goal and goal not in profile["goals"]:
            profile["goals"].append(goal)

    for note in updates.get("new_taste_notes", []) or []:
        if note and note not in profile["taste"]["notes"]:
            profile["taste"]["notes"].append(note)

    for term, meanings in (updates.get("new_vocabulary", {}) or {}).items():
        term = term.strip().lower()
        if not term:
            continue
        existing = profile["vocabulary_map"].setdefault(term, [])
        for meaning in meanings:
            if meaning not in existing:
                existing.append(meaning)

    profile["session_count"] = profile.get("session_count", 0) + 1
    save_profile(profile)
    return profile
