const log = document.getElementById("log");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const sendBtn = document.getElementById("sendBtn");
const profileBtn = document.getElementById("profileBtn");
const profileDialog = document.getElementById("profileDialog");
const profileContent = document.getElementById("profileContent");
const closeProfile = document.getElementById("closeProfile");

function addBubble(role, text) {
  const el = document.createElement("div");
  el.className = `bubble ${role}`;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

function autoGrow() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 104) + "px";
}
input.addEventListener("input", autoGrow);

async function sendMessage(message) {
  addBubble("user", message);
  sendBtn.disabled = true;
  const pending = addBubble("assistant", "…thinking…");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      pending.textContent = `Error: ${err.detail || res.statusText}`;
      return;
    }
    const data = await res.json();
    pending.textContent = data.reply;
  } catch (e) {
    pending.textContent = `Network error: ${e.message}`;
  } finally {
    sendBtn.disabled = false;
    log.scrollTop = log.scrollHeight;
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = "";
  autoGrow();
  sendMessage(message);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

profileBtn.addEventListener("click", async () => {
  profileContent.textContent = "Loading…";
  profileDialog.showModal();
  try {
    const res = await fetch("/api/profile");
    const data = await res.json();
    profileContent.textContent = JSON.stringify(data, null, 2);
  } catch (e) {
    profileContent.textContent = `Failed to load profile: ${e.message}`;
  }
});

closeProfile.addEventListener("click", () => profileDialog.close());

addBubble(
  "system",
  "This is your private XR7000 teacher. It remembers your skill level, taste, and vocabulary across sessions. It can't hear you play yet — that's a later phase."
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
