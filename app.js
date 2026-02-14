// ====== CONFIG ======
const METADATA_URL = "images/metadata.csv";

// Your backend endpoint that writes to MongoDB
const SAVE_ENDPOINT = "https://snm-image-review-backend-n86f.vercel.app/api/decision";
// =====================

const sessionId = crypto.randomUUID();
const startBtn = document.getElementById("startBtn");
const appDiv = document.getElementById("app");
const imageEl = document.getElementById("image");
const imageCounterEl = document.getElementById("imageCounter");
const decisionBtnDiv = document.getElementById("decisionBtnDiv");
const acceptBtn = document.getElementById("acceptBtn");
const denyBtn = document.getElementById("denyBtn");
const statusEl = document.getElementById("status");
const zoomRange = document.getElementById("zoomRange");
const zoomValueEl = document.getElementById("zoomValue");

let metadata = [];   // array of { filename, bend, rotate, vshift, imagePath }
let currentIndex = 0;
let saving = false;

// ---------- helpers ----------

/** Parse CSV text into array of objects */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = vals[i]));
    return obj;
  });
}

/** Fisher-Yates (in-place) shuffle */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- UI ----------

function setButtonsDisabled(disabled) {
  acceptBtn.disabled = disabled;
  denyBtn.disabled = disabled;
}

function resetZoom() {
  zoomRange.value = 1;
  imageEl.style.transform = 'scale(1)';
  zoomValueEl.textContent = '1.0×';
}

function updateUI() {
  if (currentIndex < metadata.length) {
    imageEl.src = metadata[currentIndex].imagePath;
    imageCounterEl.textContent = `Image ${currentIndex + 1} of ${metadata.length}`;
    statusEl.textContent = "";
    setButtonsDisabled(false);
    resetZoom();
  } else {
    imageEl.style.display = "none";
    decisionBtnDiv.style.display = "none";
    imageCounterEl.textContent = "No more images.";
    statusEl.textContent = "Review complete. Thank you!";
    setButtonsDisabled(true);
  }
}

// ---------- zoom ----------

zoomRange.addEventListener("input", () => {
  const z = parseFloat(zoomRange.value);
  imageEl.style.transform = `scale(${z})`;
  zoomValueEl.textContent = `${z.toFixed(1)}×`;
});

// ---------- start ----------

startBtn.addEventListener("click", async () => {

  try {
    startBtn.disabled = true;
    startBtn.textContent = "Loading…";

    // Fetch and parse metadata
    const res = await fetch(METADATA_URL);
    if (!res.ok) throw new Error(`Failed to load metadata (HTTP ${res.status})`);
    const csv = await res.text();
    metadata = parseCSV(csv).map((row) => ({
      filename: row.filename,
      bend: parseFloat(row.bend),
      rotate: parseFloat(row.rotate),
      vshift: parseInt(row.vshift, 10),
      imagePath: `/images/${row.filename}.png`,
      angle: parseFloat(row.angle),
      depth: parseFloat(row.depth),
    }));

    // Shuffle for each session
    shuffle(metadata);

    // Show the review UI
    document.getElementById("startBlock").style.display = "none";
    currentIndex = 0;
    saving = false;
    appDiv.classList.remove("hidden");
    updateUI();
  } catch (err) {
    console.error(err);
    alert(`Could not load image metadata: ${err.message}`);
    startBtn.disabled = false;
    startBtn.textContent = "Start";
  }
});

// ---------- save ----------

async function saveDecisionToMongo({ sessionId, decision, meta }) {
  const payload = {
    timestamp: new Date().toISOString(),
    sessionId,
    decision,
    filename: meta.filename,
    bend: meta.bend,
    rotate: meta.rotate,
    vshift: meta.vshift,
    angle: meta.angle,
    depth: meta.depth,
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
  } catch (_) { }

  if (!res.ok || !data?.ok) {
    const msg = data?.error || `Save failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
}

async function recordAndAdvance(decision) {
  if (saving) return;
  if (currentIndex >= metadata.length) return;

  const currentMeta = metadata[currentIndex];

  try {
    saving = true;
    setButtonsDisabled(true);
    statusEl.textContent = "Saving...";

    await saveDecisionToMongo({
      sessionId,
      decision, // "accept" or "reposition"
      meta: currentMeta,
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