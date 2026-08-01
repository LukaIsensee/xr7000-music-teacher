/** Tests for English -> theory extraction. Run: node frontend/theory-context.test.js
 *
 * The chord detector is the risky part: musical notation overlaps with ordinary
 * English ("a", "am", "in F"), so false positives are tested explicitly. */
const TC = require("./theory-context.js");

let passed = 0;
let failed = 0;

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    console.log(`FAIL ${label}\n     expected ${e}\n     actual   ${a}`);
  }
}

// --- key detection ---
eq(TC.detectKey("I'm in C major here"), { tonic: "C", mode: "major" }, "C major");
eq(TC.detectKey("this is A minor"), { tonic: "A", mode: "minor" }, "A minor");
eq(TC.detectKey("try D dorian over it"), { tonic: "D", mode: "dorian" }, "D dorian");
eq(TC.detectKey("in the key of Bb"), { tonic: "Bb", mode: "major" }, "bare key defaults to major");
eq(TC.detectKey("no key mentioned at all"), null, "no key -> null");

// --- chord detection ---
eq(TC.detectChords("play Am then F"), ["Am", "F"], "quality chord licenses bare neighbour");
eq(TC.detectChords("C Am F G"), ["C", "Am", "F", "G"], "progression keeps its played order");
eq(TC.detectChords("G7 C Am"), ["G7", "C", "Am"], "order preserved with qualified chord first");
eq(TC.detectChords("resolve to Cmaj7"), ["Cmaj7"], "single qualified chord");
eq(TC.detectChords("that F#m7b5 sounds odd"), ["F#m7b5"], "complex symbol");

// False positives: ordinary English must not become chords.
eq(TC.detectChords("I am not sure what to do"), [], "lowercase 'am' is not Am");
eq(TC.detectChords("that is a good idea"), [], "lowercase article 'a' is not A");
eq(TC.detectChords("give me a hint"), [], "no chords in plain prose");
eq(TC.detectChords("What should I do here?"), [], "bare capital with no companion is ignored");

// --- mood detection ---
eq(TC.detectMoods("make it more sorrowful", null), ["sorrowful"], "builtin mood word");
eq(
  TC.detectMoods("something wistful please", { vocabulary_map: { wistful: ["Dorian"] } }),
  ["wistful"],
  "student's own vocabulary is detected"
);
eq(TC.detectMoods("just a normal question", null), [], "no mood words");

// --- fact assembly ---
const facts = TC.buildFacts("In C major playing C Am F G, make it more sorrowful", null);
eq(facts.key, { tonic: "C", mode: "major" }, "facts carry the key");
eq(facts.text.includes("Am (minor triad) = A C E"), true, "chord tones present");
eq(facts.text.includes("I=C, ii=Dm, iii=Em, IV=F, V=G, vi=Am"), true, "diatonic chords present");
eq(facts.text.includes("C = I, Am = vi, F = IV, G = V"), true, "roman numeral analysis present");
eq(facts.text.includes("[Am]"), true, "sorrowful suggests Am in C major");
eq(facts.text.includes("[Fm]"), true, "sorrowful suggests borrowed Fm");
eq(TC.buildFacts("hello, how are you?", null), null, "non-musical message yields no facts");

const personalFacts = TC.buildFacts("make it wistful", {
  vocabulary_map: { wistful: ["Dorian mode", "open 5ths"] },
});
eq(
  personalFacts.text.includes('The student\'s own past use of "wistful": Dorian mode; open 5ths'),
  true,
  "student vocabulary surfaces in facts"
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
