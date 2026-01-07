// ====== CONFIG ======
const IMAGES = Array.from({ length: 60 }, (_, i) => {
  const num = (i + 1).toString().padStart(2, "0");
  return `images/variation_${num}.png`;
});

// Your backend endpoint that writes to MongoDB
const SAVE_ENDPOINT = "https://snm-image-review-backend-mjahkkuwn-jays-projects-1d13f6e7.vercel.app/api/decision";
// =====================

const usernameInput = document.getElementById("username");
const startBtn = document.getElementById("startBtn");
const appDiv = document.getElementById("app");
const imageEl = document.getElementById("image");
const imageCounterEl = document.getElementById("imageCounter");
const decisionBtnDiv = document.getElementById("decisionBtnDiv");
const acceptBtn = document.getElementById("acceptBtn");
const denyBtn = document.getElementById("denyBtn");
const statusEl = document.getElementById("status");

let currentIndex = 0;
let saving = false;

function setButtonsDisabled(disabled) {
  acceptBtn.disabled = disabled;
  denyBtn.disabled = disabled;
}

function updateUI() {
  if (currentIndex < IMAGES.length) {
    imageEl.src = IMAGES[currentIndex];
    imageCounterEl.textContent = `Image ${currentIndex + 1} of ${IMAGES.length}`;
    statusEl.textContent = "";
    setButtonsDisabled(false);
  } else {
    imageEl.style.display = "none";
    decisionBtnDiv.style.display = "none";
    imageCounterEl.textContent = "No more images.";
    statusEl.textContent = "Review complete. Thank you!";
    setButtonsDisabled(true);
  }
}

startBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  if (!username) {
    alert("Please enter your name first.");
    return;
  }

  // hide block
  document.getElementById("startBlock").style.display = "none";

  currentIndex = 0;
  saving = false;
  appDiv.classList.remove("hidden");
  updateUI();
});

async function saveDecisionToMongo({ username, image, decision }) {
  const payload = {
    timestamp: new Date().toISOString(),
    username,
    image,
    decision,
  };

  const res = await fetch(SAVE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // Expect JSON like { ok: true }
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok || !data?.ok) {
    const msg = data?.error || `Save failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
}

async function recordAndAdvance(decision) {
  if (saving) return;
  if (currentIndex >= IMAGES.length) return;

  const username = usernameInput.value.trim();
  if (!username) {
    alert("Missing username.");
    return;
  }

  const imagePath = IMAGES[currentIndex];

  try {
    saving = true;
    setButtonsDisabled(true);
    statusEl.textContent = "Saving...";

    await saveDecisionToMongo({
      username,
      image: imagePath,
      decision, // "accept" or "reposition"
    });

    // Advance immediately after successful save
    currentIndex += 1;
    updateUI();
  } catch (err) {
    console.error(err);
    statusEl.textContent = `${err.message}. Please try again.`;
    setButtonsDisabled(false); // allow retry on same image
  } finally {
    saving = false;
  }
}

acceptBtn.addEventListener("click", () => recordAndAdvance("accept"));
denyBtn.addEventListener("click", () => recordAndAdvance("reposition"));