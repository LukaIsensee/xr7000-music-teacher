/**
 * Browser-side persistence — the on-device counterpart to backend/memory.py.
 *
 * Conversation history and the student profile live in localStorage, so the app
 * remembers across sessions with no server involved. This data never leaves the
 * phone.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.LocalMemory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HISTORY_KEY = "xr7000.history";
  const PROFILE_KEY = "xr7000.profile";
  const MAX_STORED_MESSAGES = 200;
  const CONTEXT_MESSAGES = 12; // small models have small context windows

  const DEFAULT_PROFILE = {
    instrument: {
      model: "Kawai XR7000",
      type: "home/theatre organ",
      features: [
        "multiple manuals (upper/lower)",
        "drawbars",
        "pedalboard (bass pedals)",
        "auto-rhythm/accompaniment styles",
        "Leslie speaker simulation",
        "General MIDI",
      ],
    },
    skill_level: null,
    goals: [
      "learn to play the Kawai XR7000 well",
      "improve general music understanding",
      "eventually get real-time audio feedback on playing (future phase)",
    ],
    taste: { notes: [] },
    vocabulary_map: {
      sorrowful: [
        "minor key, e.g. Am if it fits the current progression",
        "Dorian or Aeolian mode for a wistful/open colour",
        "softer drawbar registration, slower rhythm/tempo",
      ],
    },
    last_updated: null,
  };

  const storage = () => (typeof localStorage !== "undefined" ? localStorage : null);

  function read(key, fallback) {
    const store = storage();
    if (!store) return fallback;
    try {
      const raw = store.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    const store = storage();
    if (!store) return;
    try {
      store.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded — drop the oldest half of history and retry once, rather
      // than letting a full disk silently break saving.
      if (key === HISTORY_KEY && Array.isArray(value)) {
        try {
          store.setItem(key, JSON.stringify(value.slice(-Math.floor(value.length / 2))));
        } catch {
          /* give up quietly; the conversation still works in-memory */
        }
      }
    }
  }

  function loadProfile() {
    const stored = read(PROFILE_KEY, null);
    if (!stored) {
      write(PROFILE_KEY, DEFAULT_PROFILE);
      return structuredClone(DEFAULT_PROFILE);
    }
    return stored;
  }

  function saveProfile(profile) {
    profile.last_updated = new Date().toISOString();
    write(PROFILE_KEY, profile);
    return profile;
  }

  function resetProfile() {
    write(PROFILE_KEY, DEFAULT_PROFILE);
    return structuredClone(DEFAULT_PROFILE);
  }

  function getHistory() {
    return read(HISTORY_KEY, []);
  }

  function addMessage(role, content) {
    const history = getHistory();
    history.push({ role, content, ts: new Date().toISOString() });
    write(HISTORY_KEY, history.slice(-MAX_STORED_MESSAGES));
  }

  /** Recent turns, trimmed to what a small context window can carry. */
  function contextMessages() {
    return getHistory()
      .slice(-CONTEXT_MESSAGES)
      .map(({ role, content }) => ({ role, content }));
  }

  function clearHistory() {
    write(HISTORY_KEY, []);
  }

  /**
   * Record that the student used a feeling-word, and what the teacher offered in
   * response. Done deterministically rather than by asking the model to extract
   * JSON — a 1B model is not reliable at that, and a wrong profile compounds.
   */
  function noteVocabularyUse(term, meaning) {
    const profile = loadProfile();
    const key = term.trim().toLowerCase();
    if (!key) return profile;
    const existing = profile.vocabulary_map[key] || [];
    if (meaning && !existing.includes(meaning)) existing.push(meaning);
    profile.vocabulary_map[key] = existing;
    return saveProfile(profile);
  }

  return {
    DEFAULT_PROFILE,
    loadProfile,
    saveProfile,
    resetProfile,
    getHistory,
    addMessage,
    contextMessages,
    clearHistory,
    noteVocabularyUse,
  };
});
