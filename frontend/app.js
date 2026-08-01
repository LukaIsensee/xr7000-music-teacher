import {
  SUGGESTED_MODELS,
  DEFAULT_MODEL,
  generate,
  getEngine,
  unsupportedReason,
  currentModel,
} from "./llm-engine.js";

const MT = window.MusicTheory;
const TC = window.TheoryContext;
const Memory = window.LocalMemory;

const log = document.getElementById("log");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const statusBar = document.getElementById("status");
const modelSelect = document.getElementById("modelSelect");
const loadBtn = document.getElementById("loadBtn");
const profileBtn = document.getElementById("profileBtn");
const profileDialog = document.getElementById("profileDialog");
const profileContent = document.getElementById("profileContent");
const saveProfileBtn = document.getElementById("saveProfile");
const resetProfileBtn = document.getElementById("resetProfile");
const closeProfileBtn = document.getElementById("closeProfile");
const clearChatBtn = document.getElementById("clearChat");

let modelReady = false;

function addBubble(role, text) {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function setStatus(text, tone = "") {
  statusBar.textContent = text;
  statusBar.className = `status ${tone}`;
}

/** Kept short deliberately: a 1-3B model degrades fast as the prompt grows. */
function buildSystemPrompt(profile) {
  const skill = profile.skill_level || "unknown — ask, then remember";
  const vocab = Object.entries(profile.vocabulary_map || {})
    .map(([term, meanings]) => `"${term}" = ${meanings.join("; ")}`)
    .join("\n");
  const taste = (profile.taste?.notes || []).join("; ") || "none recorded";

  return `You are a private music teacher for one student, on a Kawai XR7000 home/theatre organ
(drawbars, upper/lower manuals, bass pedalboard, auto-rhythm, Leslie sim). Ground advice in that
instrument — registrations, manual splits, pedal-bass — not generic piano advice.

Student skill level: ${skill}
Taste: ${taste}
Their words for musical feelings:
${vocab}

Rules:
- Any VERIFIED FACTS block in the user message was computed exactly. Treat it as ground truth. Never
  recalculate or contradict it, and prefer its chords/notes over your own recollection.
- If no fact block covers something, say you're not certain rather than inventing note names.
- When asked for practice, be specific: exact chords, registration, hand/pedal assignment, how long,
  and how to tell it went well.
- You cannot hear the student play yet. Never claim to have heard anything.
- Be concise and concrete.`;
}

async function handleSend(message) {
  const profile = Memory.loadProfile();
  const facts = TC.buildFacts(message, profile);

  addBubble("user", message);
  Memory.addMessage("user", message);

  // The theory engine is useful on its own, so show computed facts even when no
  // model is loaded.
  if (facts) {
    const el = addBubble("facts", facts.text);
    el.dataset.role = "facts";
  }

  if (!modelReady) {
    addBubble(
      "system",
      "No model loaded yet, so the facts above are computed but unexplained. Pick a model and tap Load to get conversation."
    );
    return;
  }

  sendBtn.disabled = true;
  const pending = addBubble("assistant", "…");

  const userContent = facts ? `${facts.text}\n\nStudent: ${message}` : message;
  const messages = [
    { role: "system", content: buildSystemPrompt(profile) },
    ...Memory.contextMessages().slice(0, -1),
    { role: "user", content: userContent },
  ];

  try {
    const reply = await generate(messages, {
      modelId: modelSelect.value,
      onToken: (partial) => {
        pending.textContent = partial;
        log.scrollTop = log.scrollHeight;
      },
    });
    Memory.addMessage("assistant", reply);

    // Deterministically record any feeling-words used, so the profile grows
    // without trusting a small model to extract JSON.
    for (const mood of facts?.moods || []) {
      Memory.noteVocabularyUse(mood, null);
    }
  } catch (err) {
    pending.textContent = `Error: ${err.message}`;
    pending.className = "bubble system";
  } finally {
    sendBtn.disabled = false;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  input.style.height = "auto";
  handleSend(message);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 104) + "px";
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

loadBtn.addEventListener("click", async () => {
  loadBtn.disabled = true;
  modelSelect.disabled = true;
  try {
    await getEngine(modelSelect.value, (text, progress) => {
      setStatus(`${text} ${progress ? `(${Math.round(progress * 100)}%)` : ""}`, "loading");
    });
    modelReady = true;
    setStatus(`Ready — ${currentModel()} running on this device`, "ready");
    loadBtn.textContent = "Loaded";
  } catch (err) {
    setStatus(`Couldn't load model: ${err.message}`, "error");
    loadBtn.disabled = false;
    modelSelect.disabled = false;
  }
});

profileBtn.addEventListener("click", () => {
  profileContent.value = JSON.stringify(Memory.loadProfile(), null, 2);
  profileDialog.showModal();
});

saveProfileBtn.addEventListener("click", () => {
  try {
    Memory.saveProfile(JSON.parse(profileContent.value));
    profileDialog.close();
    setStatus("Profile saved.", "ready");
  } catch {
    alert("That isn't valid JSON — fix it before saving.");
  }
});

resetProfileBtn.addEventListener("click", () => {
  if (confirm("Reset the profile to defaults? Everything it has learned about you is lost.")) {
    profileContent.value = JSON.stringify(Memory.resetProfile(), null, 2);
  }
});

closeProfileBtn.addEventListener("click", () => profileDialog.close());

clearChatBtn.addEventListener("click", () => {
  if (confirm("Clear the conversation history? Your profile is kept.")) {
    Memory.clearHistory();
    log.innerHTML = "";
    addBubble("system", "History cleared.");
  }
});

// --- startup ---
for (const model of SUGGESTED_MODELS) {
  const option = document.createElement("option");
  option.value = model.id;
  option.textContent = model.label;
  modelSelect.appendChild(option);
}
modelSelect.value = DEFAULT_MODEL;

for (const { role, content } of Memory.getHistory()) {
  addBubble(role === "user" ? "user" : "assistant", content);
}

const blocker = unsupportedReason();
if (blocker) {
  setStatus(blocker, "error");
  loadBtn.disabled = true;
  addBubble(
    "system",
    "The on-device model can't run here, but the music theory engine still works — ask about a chord, key, or progression and you'll get exact answers."
  );
} else {
  setStatus("Pick a model and tap Load. First load downloads ~1 GB over Wi-Fi, then works offline.");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
