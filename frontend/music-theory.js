/**
 * Deterministic music theory engine.
 *
 * Nothing in this file involves an LLM. Chord tones, scales, diatonic function
 * and substitutions are computed exactly, so the language model is never asked
 * to *derive* theory — only to explain facts it is handed. This is what makes a
 * small on-device model safe to teach with.
 *
 * Notes are spelled by letter-and-accidental (a 3rd is always two letter names
 * up), not by picking from a fixed sharp/flat table. That is what makes C minor
 * come out as Eb rather than D#, and A harmonic minor end on G# rather than Ab.
 */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PCS = [0, 2, 4, 5, 7, 9, 11];

const CHORD_FORMULAS = {
  "":      { name: "major triad",         intervals: [0, 4, 7],          degrees: [0, 2, 4] },
  "m":     { name: "minor triad",         intervals: [0, 3, 7],          degrees: [0, 2, 4] },
  "dim":   { name: "diminished triad",    intervals: [0, 3, 6],          degrees: [0, 2, 4] },
  "aug":   { name: "augmented triad",     intervals: [0, 4, 8],          degrees: [0, 2, 4] },
  "sus2":  { name: "suspended 2nd",       intervals: [0, 2, 7],          degrees: [0, 1, 4] },
  "sus4":  { name: "suspended 4th",       intervals: [0, 5, 7],          degrees: [0, 3, 4] },
  "6":     { name: "major 6th",           intervals: [0, 4, 7, 9],       degrees: [0, 2, 4, 5] },
  "m6":    { name: "minor 6th",           intervals: [0, 3, 7, 9],       degrees: [0, 2, 4, 5] },
  "7":     { name: "dominant 7th",        intervals: [0, 4, 7, 10],      degrees: [0, 2, 4, 6] },
  "maj7":  { name: "major 7th",           intervals: [0, 4, 7, 11],      degrees: [0, 2, 4, 6] },
  "m7":    { name: "minor 7th",           intervals: [0, 3, 7, 10],      degrees: [0, 2, 4, 6] },
  "m7b5":  { name: "half-diminished 7th", intervals: [0, 3, 6, 10],      degrees: [0, 2, 4, 6] },
  "dim7":  { name: "diminished 7th",      intervals: [0, 3, 6, 9],       degrees: [0, 2, 4, 6] },
  "mMaj7": { name: "minor-major 7th",     intervals: [0, 3, 7, 11],      degrees: [0, 2, 4, 6] },
  "add9":  { name: "added 9th",           intervals: [0, 4, 7, 14],      degrees: [0, 2, 4, 8] },
  "9":     { name: "dominant 9th",        intervals: [0, 4, 7, 10, 14],  degrees: [0, 2, 4, 6, 8] },
  "maj9":  { name: "major 9th",           intervals: [0, 4, 7, 11, 14],  degrees: [0, 2, 4, 6, 8] },
  "m9":    { name: "minor 9th",           intervals: [0, 3, 7, 10, 14],  degrees: [0, 2, 4, 6, 8] },
};

const SCALE_FORMULAS = {
  major:            [0, 2, 4, 5, 7, 9, 11],
  ionian:           [0, 2, 4, 5, 7, 9, 11],
  dorian:           [0, 2, 3, 5, 7, 9, 10],
  phrygian:         [0, 1, 3, 5, 7, 8, 10],
  lydian:           [0, 2, 4, 6, 7, 9, 11],
  mixolydian:       [0, 2, 4, 5, 7, 9, 10],
  aeolian:          [0, 2, 3, 5, 7, 8, 10],
  "natural minor":  [0, 2, 3, 5, 7, 8, 10],
  minor:            [0, 2, 3, 5, 7, 8, 10],
  locrian:          [0, 1, 3, 5, 6, 8, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic minor":  [0, 2, 3, 5, 7, 9, 11],
};

// Characteristic colour of each mode relative to plain major/minor — used to
// explain *why* a mode sounds the way it does, rather than just naming it.
const MODE_CHARACTER = {
  ionian: "plain major; no altered tones",
  major: "plain major; no altered tones",
  dorian: "minor with a raised 6th — sad but not bleak, a hopeful edge",
  phrygian: "minor with a flat 2nd — dark, Spanish/tense",
  lydian: "major with a sharp 4th — bright, floating, unresolved",
  mixolydian: "major with a flat 7th — bluesy, gospel, less final than major",
  aeolian: "natural minor — plainly sad, fully settled",
  "natural minor": "natural minor — plainly sad, fully settled",
  minor: "natural minor — plainly sad, fully settled",
  locrian: "flat 2nd and flat 5th — unstable, rarely used as a home key",
  "harmonic minor": "minor with a raised 7th — dramatic, strong pull to the tonic",
  "melodic minor": "minor with raised 6th and 7th — smooth, jazzy ascent",
};

const mod = (n, m) => ((n % m) + m) % m;

/** Parse "F#" / "Bb" into { pc, letterIndex }. */
function parseNoteName(note) {
  const match = /^([A-Ga-g])([#b]*)$/.exec(String(note).trim());
  if (!match) return null;
  const letterIndex = LETTERS.indexOf(match[1].toUpperCase());
  let pc = LETTER_PCS[letterIndex];
  for (const accidental of match[2]) pc += accidental === "#" ? 1 : -1;
  return { pc: mod(pc, 12), letterIndex };
}

function normalizeNoteName(note) {
  const parsed = parseNoteName(note);
  return parsed ? parsed.pc : null;
}

/** Spell a pitch class using a specific letter name, adding the accidentals
 *  needed to reach it. This is what yields correct enharmonic spelling. */
function spell(pc, letterIndex) {
  const letter = LETTERS[mod(letterIndex, 7)];
  let diff = mod(pc - LETTER_PCS[mod(letterIndex, 7)], 12);
  if (diff > 6) diff -= 12;
  const accidental = diff > 0 ? "#".repeat(diff) : "b".repeat(-diff);
  return letter + accidental;
}

/** Fallback naming when no letter context is available. */
function pcToName(pc, preferFlats = false) {
  const sharps = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const flats = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  return (preferFlats ? flats : sharps)[mod(pc, 12)];
}

const CHORD_ALIASES = {
  min: "m", "-": "m", maj: "", M: "", Δ: "maj7", "ø": "m7b5", "m7-5": "m7b5",
  "°": "dim", "°7": "dim7", "+": "aug", M7: "maj7", min7: "m7", dom7: "7",
  minMaj7: "mMaj7", mmaj7: "mMaj7",
};

/** Parse a chord symbol like "Am", "F#m7b5", "Cmaj7", "Bb7" into its tones. */
function parseChord(symbol) {
  const match = /^([A-Ga-g][#b]*)(.*)$/.exec(String(symbol).trim());
  if (!match) return null;

  const root = parseNoteName(match[1]);
  if (!root) return null;

  let quality = match[2].trim();
  if (quality in CHORD_ALIASES) quality = CHORD_ALIASES[quality];

  const formula = CHORD_FORMULAS[quality];
  if (!formula) return null;

  const notes = formula.intervals.map((interval, i) =>
    spell(root.pc + interval, root.letterIndex + formula.degrees[i])
  );

  return {
    symbol: String(symbol).trim(),
    root: spell(root.pc, root.letterIndex),
    quality: formula.name,
    notes,
    pitchClasses: formula.intervals.map((interval) => mod(root.pc + interval, 12)),
  };
}

/** Spell a scale/mode from a tonic, e.g. scaleNotes("D", "dorian"). */
function scaleNotes(tonic, scaleName) {
  const root = parseNoteName(tonic);
  const key = String(scaleName).toLowerCase();
  const formula = SCALE_FORMULAS[key];
  if (!root || !formula) return null;

  return {
    tonic: spell(root.pc, root.letterIndex),
    scale: key,
    character: MODE_CHARACTER[key] || null,
    // Degree i always takes the i-th letter above the tonic.
    notes: formula.map((interval, i) => spell(root.pc + interval, root.letterIndex + i)),
  };
}

const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
const MAJOR_QUALITIES = ["", "m", "m", "", "", "m", "dim"];
const MINOR_QUALITIES = ["m", "dim", "", "m", "m", "", ""];

const isMinorMode = (mode) =>
  ["minor", "natural minor", "aeolian"].includes(String(mode).toLowerCase());

/** The seven diatonic triads of a key, with roman numerals. */
function diatonicChords(tonic, mode = "major") {
  const minor = isMinorMode(mode);
  const scale = scaleNotes(tonic, minor ? "aeolian" : "major");
  if (!scale) return null;

  const numerals = minor ? MINOR_NUMERALS : MAJOR_NUMERALS;
  const qualities = minor ? MINOR_QUALITIES : MAJOR_QUALITIES;

  return scale.notes.map((rootName, degree) => {
    const symbol = rootName + qualities[degree];
    return { numeral: numerals[degree], symbol, notes: parseChord(symbol).notes };
  });
}

/** Label each chord of a progression with its roman numeral in the given key. */
function analyzeProgression(chords, tonic, mode = "major") {
  const diatonic = diatonicChords(tonic, mode);
  if (!diatonic) return null;

  const byRootAndQuality = new Map(diatonic.map((c) => [c.symbol, c.numeral]));

  return chords.map((symbol) => {
    const parsed = parseChord(symbol);
    if (!parsed) return { symbol, numeral: null, diatonic: false, note: "unrecognized chord" };

    // Reduce to the underlying triad (ignoring 7ths and extensions) by measuring
    // the 3rd and 5th directly, so m7b5 correctly reduces to a diminished triad.
    const [rootPc, thirdPc, fifthPc] = parsed.pitchClasses;
    const third = mod(thirdPc - rootPc, 12);
    const fifth = mod(fifthPc - rootPc, 12);

    let triadQuality;
    if (third === 3) triadQuality = fifth === 6 ? "dim" : "m";
    else if (third === 4) triadQuality = fifth === 8 ? "aug" : "";
    else triadQuality = null; // suspended: no 3rd, so no major/minor function

    const numeral =
      triadQuality === null ? null : byRootAndQuality.get(parsed.root + triadQuality) || null;

    return {
      symbol,
      root: parsed.root,
      quality: parsed.quality,
      notes: parsed.notes,
      numeral,
      diatonic: numeral !== null,
    };
  });
}

/**
 * Concrete, theory-grounded options for moving a progression toward a feeling.
 * These are *devices*, not opinions: each names a real harmonic move and the
 * chords it produces in the current key. The student's own vocabulary (stored
 * in their profile) is layered on top of these defaults by the caller.
 */
const MOOD_DEVICES = {
  sorrowful: ["relative minor", "borrowed iv", "aeolian", "dorian", "descending bass"],
  sad: ["relative minor", "borrowed iv", "aeolian", "dorian", "descending bass"],
  dark: ["phrygian", "borrowed bVI", "harmonic minor"],
  tense: ["diminished 7th", "harmonic minor", "phrygian"],
  bright: ["lydian", "IV", "major"],
  dreamy: ["maj7 voicings", "sus2", "lydian"],
  bluesy: ["mixolydian", "dominant 7ths"],
  soulful: ["mixolydian", "dominant 7ths", "borrowed iv"],
  hopeful: ["dorian", "IV", "major"],
};

function suggestForMood(mood, tonic, mode = "major") {
  const devices = MOOD_DEVICES[String(mood).trim().toLowerCase()];
  const root = parseNoteName(tonic);
  if (!devices || !root) return null;

  const minor = isMinorMode(mode);
  const tonicName = spell(root.pc, root.letterIndex);
  // Spell a chord root a given number of semitones / letter-steps above the tonic.
  const at = (semitones, letterSteps) =>
    spell(root.pc + semitones, root.letterIndex + letterSteps);

  const suggestions = [];

  for (const device of devices) {
    switch (device) {
      case "relative minor": {
        if (minor) break;
        const rel = at(9, 5);
        suggestions.push({
          device: "relative minor (vi)",
          chords: [rel + "m"],
          why: `${rel}m shares every note with ${tonicName} major, so it darkens the colour without leaving the key.`,
        });
        break;
      }
      case "borrowed iv": {
        const iv = at(5, 3);
        suggestions.push({
          device: "borrowed minor iv",
          chords: [iv + "m"],
          why: `${iv}m borrows from the parallel minor — one flattened note against a major key, which reads as a sudden ache.`,
        });
        break;
      }
      case "borrowed bVI": {
        const bvi = at(8, 5);
        suggestions.push({
          device: "borrowed bVI",
          chords: [bvi],
          why: `${bvi} sits outside the major key entirely, dropping the floor out from under the tonic.`,
        });
        break;
      }
      case "diminished 7th": {
        const sharpI = at(1, 0);
        suggestions.push({
          device: "passing diminished 7th",
          chords: [sharpI + "dim7"],
          why: `${sharpI}dim7 is unstable in every direction — it creates pull without committing to a destination.`,
        });
        break;
      }
      case "dominant 7ths": {
        suggestions.push({
          device: "dominant 7th colour",
          chords: [at(7, 4) + "7", tonicName + "7"],
          why: "Dominant 7ths add the flat-7 rub that reads as blues/gospel rather than classical resolution.",
        });
        break;
      }
      case "maj7 voicings": {
        suggestions.push({
          device: "major 7th voicings",
          chords: [tonicName + "maj7", at(5, 3) + "maj7"],
          why: "The major 7th softens the root's finality, so chords hang rather than land.",
        });
        break;
      }
      case "sus2": {
        suggestions.push({
          device: "sus2",
          chords: [tonicName + "sus2"],
          why: "Removing the 3rd removes major/minor entirely — open and unresolved.",
        });
        break;
      }
      case "IV": {
        const iv = at(5, 3);
        suggestions.push({
          device: "IV",
          chords: [iv],
          why: `${iv} lifts away from the tonic without tension.`,
        });
        break;
      }
      case "descending bass": {
        suggestions.push({
          device: "descending bass line",
          chords: [],
          why: "Hold the harmony and walk the pedal bass down by step — a descending bass reads as grief almost independently of the chords above it.",
        });
        break;
      }
      default: {
        // Remaining devices are modes.
        const scale = scaleNotes(tonic, device);
        if (scale) {
          suggestions.push({
            device: `${device} mode`,
            chords: [],
            scale: scale.notes,
            why: scale.character,
          });
        }
      }
    }
  }

  return { mood: String(mood).trim().toLowerCase(), key: `${tonicName} ${minor ? "minor" : "major"}`, suggestions };
}

const MusicTheory = {
  parseChord,
  scaleNotes,
  diatonicChords,
  analyzeProgression,
  suggestForMood,
  normalizeNoteName,
  pcToName,
  spell,
  MODE_CHARACTER,
  MOOD_DEVICES,
  CHORD_FORMULAS,
  SCALE_FORMULAS,
};

if (typeof module !== "undefined" && module.exports) module.exports = MusicTheory;
if (typeof window !== "undefined") window.MusicTheory = MusicTheory;
