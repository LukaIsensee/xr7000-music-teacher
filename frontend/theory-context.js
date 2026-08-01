/**
 * Bridges plain English to the deterministic theory engine.
 *
 * Scans a message for keys, chord symbols and feeling-words, computes the
 * relevant facts exactly, and formats them as a VERIFIED FACTS block that gets
 * prepended to the model's context. The model is then explaining arithmetic
 * someone else did, rather than recalling theory it may have wrong.
 */
(function (root, factory) {
  const MT = typeof require !== "undefined" ? require("./music-theory.js") : root.MusicTheory;
  const api = factory(MT);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.TheoryContext = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (MT) {
  const MODE_NAMES = Object.keys(MT.SCALE_FORMULAS);

  /** Find "C major", "A minor", "D dorian" etc. */
  function detectKey(text) {
    const modeAlternatives = MODE_NAMES.map((m) => m.replace(/ /g, "\\s+")).join("|");
    const re = new RegExp(`\\b([A-G][#b]?)\\s+(${modeAlternatives})\\b`, "i");
    const match = re.exec(text);
    if (match) {
      return { tonic: match[1][0].toUpperCase() + match[1].slice(1), mode: match[2].toLowerCase() };
    }
    // "key of C" / "in C" with no mode stated defaults to major.
    const bare = /\b(?:key of|in)\s+([A-G][#b]?)\b/.exec(text);
    if (bare) return { tonic: bare[1], mode: "major" };
    return null;
  }

  // Root must be uppercase so the English words "a", "am", "f" don't match.
  const CHORD_RE =
    /\b([A-G][#b]?)(maj9|maj7|mMaj7|m7b5|dim7|add9|sus2|sus4|m9|m7|m6|aug|dim|m|maj|9|7|6)?\b/g;

  /**
   * Extract chord symbols. Bare single letters (C, F, G) are ambiguous with
   * ordinary English, so they only count when the message looks like it lists a
   * progression — i.e. at least two candidates were found.
   */
  function detectChords(text) {
    const candidates = [];
    let match;
    CHORD_RE.lastIndex = 0;
    while ((match = CHORD_RE.exec(text)) !== null) {
      const symbol = match[1] + (match[2] || "");
      if (!MT.parseChord(symbol)) continue;
      candidates.push({ symbol, hasQuality: Boolean(match[2]) });
    }

    const anyQualified = candidates.some((c) => c.hasQuality);
    if (!anyQualified && candidates.length < 2) return [];

    // Order is preserved: a progression's sequence carries musical meaning, so
    // the chords must reach the analyzer in the order they were played.
    return [...new Set(candidates.map((c) => c.symbol))];
  }

  /** Feeling-words: the student's own vocabulary first, then built-in defaults. */
  function detectMoods(text, profile) {
    const lower = text.toLowerCase();
    const personal = Object.keys((profile && profile.vocabulary_map) || {});
    const builtin = Object.keys(MT.MOOD_DEVICES);
    const found = [];
    for (const term of [...new Set([...personal, ...builtin])]) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lower)) found.push(term);
    }
    return found;
  }

  /**
   * Build the verified-facts block. Returns null when the message contains
   * nothing musical to compute, so ordinary conversation isn't cluttered.
   */
  function buildFacts(text, profile) {
    const key = detectKey(text);
    const chords = detectChords(text);
    const moods = detectMoods(text, profile);
    const lines = [];

    for (const symbol of chords) {
      const parsed = MT.parseChord(symbol);
      if (parsed) lines.push(`${parsed.symbol} (${parsed.quality}) = ${parsed.notes.join(" ")}`);
    }

    if (key) {
      const scale = MT.scaleNotes(key.tonic, key.mode);
      if (scale) {
        lines.push(`${scale.tonic} ${scale.scale} scale = ${scale.notes.join(" ")}`);
        if (scale.character) lines.push(`${scale.scale} character: ${scale.character}`);
      }
      const diatonic = MT.diatonicChords(key.tonic, key.mode);
      if (diatonic) {
        lines.push(
          `Diatonic chords in ${key.tonic} ${key.mode}: ` +
            diatonic.map((c) => `${c.numeral}=${c.symbol}`).join(", ")
        );
      }
      if (chords.length) {
        const analysis = MT.analyzeProgression(chords, key.tonic, key.mode);
        const labelled = analysis
          .map((c) => `${c.symbol}${c.numeral ? ` = ${c.numeral}` : " = non-diatonic"}`)
          .join(", ");
        lines.push(`Function in ${key.tonic} ${key.mode}: ${labelled}`);
      }
    }

    for (const mood of moods) {
      const personal = profile && profile.vocabulary_map && profile.vocabulary_map[mood];
      if (personal && personal.length) {
        lines.push(`The student's own past use of "${mood}": ${personal.join("; ")}`);
      }
      if (key && MT.MOOD_DEVICES[mood]) {
        const suggestion = MT.suggestForMood(mood, key.tonic, key.mode);
        if (suggestion) {
          for (const s of suggestion.suggestions) {
            const chordPart = s.chords.length ? ` [${s.chords.join(", ")}]` : "";
            const scalePart = s.scale ? ` [${s.scale.join(" ")}]` : "";
            lines.push(`Option for "${mood}" — ${s.device}${chordPart}${scalePart}: ${s.why}`);
          }
        }
      }
    }

    if (!lines.length) return null;

    return {
      key,
      chords,
      moods,
      text:
        "VERIFIED FACTS (computed exactly — treat as ground truth, never contradict or " +
        "recalculate these):\n" +
        lines.map((l) => `- ${l}`).join("\n"),
    };
  }

  return { detectKey, detectChords, detectMoods, buildFacts };
});
