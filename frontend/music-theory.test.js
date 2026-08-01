/** Correctness tests for the theory engine. Run: node frontend/music-theory.test.js
 *
 * These matter more than usual: the whole point of computing theory in code is
 * that it is verifiably right, so a small on-device model never has to guess. */
const T = require("./music-theory.js");

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL ${label}\n     expected ${e}\n     actual   ${a}`);
  }
}

// --- chord spelling ---
eq(T.parseChord("Am").notes, ["A", "C", "E"], "Am triad");
eq(T.parseChord("C").notes, ["C", "E", "G"], "C triad");
eq(T.parseChord("Cmaj7").notes, ["C", "E", "G", "B"], "Cmaj7");
eq(T.parseChord("G7").notes, ["G", "B", "D", "F"], "G7");
eq(T.parseChord("Dm7").notes, ["D", "F", "A", "C"], "Dm7");
eq(T.parseChord("F#m7b5").notes, ["F#", "A", "C", "E"], "F#m7b5");
eq(T.parseChord("Bb7").notes, ["Bb", "D", "F", "Ab"], "Bb7 spells with flats");
eq(T.parseChord("Bdim7").notes, ["B", "D", "F", "Ab"], "Bdim7 spells the d7 as Ab, not G#");
eq(T.parseChord("Csus4").notes, ["C", "F", "G"], "Csus4");
eq(T.parseChord("Caug").notes, ["C", "E", "G#"], "Caug");
eq(T.parseChord("Am9").notes, ["A", "C", "E", "G", "B"], "Am9 extension wraps octave");
eq(T.parseChord("Cmin7").notes, ["C", "Eb", "G", "Bb"], "alias min7 -> m7");
eq(T.parseChord("Hx7"), null, "invalid chord returns null");

// Letter-based spelling: each chord tone takes its own letter name.
eq(T.parseChord("Ebm").notes, ["Eb", "Gb", "Bb"], "Ebm keeps one letter per tone");
eq(T.parseChord("F#").notes, ["F#", "A#", "C#"], "F# major uses sharps, not Bb/Db");
eq(T.scaleNotes("Eb", "major").notes, ["Eb", "F", "G", "Ab", "Bb", "C", "D"], "Eb major has 3 flats");
eq(
  T.scaleNotes("C", "major").notes.map((n) => n[0]),
  ["C", "D", "E", "F", "G", "A", "B"],
  "every scale degree gets a distinct letter"
);

// --- scales and modes ---
eq(T.scaleNotes("D", "dorian").notes, ["D", "E", "F", "G", "A", "B", "C"], "D dorian");
eq(T.scaleNotes("C", "lydian").notes, ["C", "D", "E", "F#", "G", "A", "B"], "C lydian");
eq(T.scaleNotes("E", "phrygian").notes, ["E", "F", "G", "A", "B", "C", "D"], "E phrygian");
eq(T.scaleNotes("A", "aeolian").notes, ["A", "B", "C", "D", "E", "F", "G"], "A aeolian");
eq(T.scaleNotes("G", "mixolydian").notes, ["G", "A", "B", "C", "D", "E", "F"], "G mixolydian");
eq(T.scaleNotes("A", "harmonic minor").notes, ["A", "B", "C", "D", "E", "F", "G#"], "A harmonic minor");
eq(T.scaleNotes("C", "major").notes, ["C", "D", "E", "F", "G", "A", "B"], "C major");

// --- diatonic harmony ---
eq(
  T.diatonicChords("C", "major").map((c) => c.symbol),
  ["C", "Dm", "Em", "F", "G", "Am", "Bdim"],
  "C major diatonic triads"
);
eq(
  T.diatonicChords("C", "major").map((c) => c.numeral),
  ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
  "major numerals"
);
eq(
  T.diatonicChords("A", "minor").map((c) => c.symbol),
  ["Am", "Bdim", "C", "Dm", "Em", "F", "G"],
  "A minor diatonic triads"
);

// --- progression analysis ---
eq(
  T.analyzeProgression(["C", "Am", "F", "G"], "C", "major").map((c) => c.numeral),
  ["I", "vi", "IV", "V"],
  "I-vi-IV-V in C"
);
eq(
  T.analyzeProgression(["Dm7", "G7", "Cmaj7"], "C", "major").map((c) => c.numeral),
  ["ii", "V", "I"],
  "ii-V-I ignores 7th extensions"
);
eq(
  T.analyzeProgression(["Bm7b5"], "C", "major")[0].numeral,
  "vii°",
  "m7b5 reduces to diminished triad"
);
eq(
  T.analyzeProgression(["Ab"], "C", "major")[0].diatonic,
  false,
  "borrowed bVI flagged as non-diatonic"
);
eq(
  T.analyzeProgression(["Csus4"], "C", "major")[0].numeral,
  null,
  "suspended chord has no major/minor function"
);

// --- mood suggestions ---
const sorrowful = T.suggestForMood("sorrowful", "C", "major");
eq(sorrowful.key, "C major", "mood suggestion reports key");
eq(
  sorrowful.suggestions.find((s) => s.device === "relative minor (vi)").chords,
  ["Am"],
  "sorrowful in C major suggests Am"
);
eq(
  sorrowful.suggestions.find((s) => s.device === "borrowed minor iv").chords,
  ["Fm"],
  "sorrowful in C major suggests borrowed Fm"
);
eq(
  sorrowful.suggestions.some((s) => s.device === "dorian mode"),
  true,
  "sorrowful offers dorian as an option"
);
eq(
  T.suggestForMood("sorrowful", "A", "minor").suggestions.some(
    (s) => s.device === "relative minor (vi)"
  ),
  false,
  "no relative-minor suggestion when already in minor"
);
eq(T.suggestForMood("nonsense-word", "C", "major"), null, "unknown mood returns null");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
