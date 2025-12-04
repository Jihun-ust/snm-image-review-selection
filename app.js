// ====== CONFIG ======
const IMAGES = Array.from({ length: 60 }, (_, i) => {
  const num = (i + 1).toString().padStart(2, "0");
  return `images/variation_${num}.png`;
});
// =====================

const usernameInput = document.getElementById("username");
const startBtn = document.getElementById("startBtn");
const appDiv = document.getElementById("app");
const imageEl = document.getElementById("image");
const imageCounterEl = document.getElementById("imageCounter");
const acceptBtn = document.getElementById("acceptBtn");
const denyBtn = document.getElementById("denyBtn");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");
const statusEl = document.getElementById("status");

let currentIndex = 0;
let decisions = []; // { image, decision }

function updateUI() {
  if (currentIndex < IMAGES.length) {
    imageEl.src = IMAGES[currentIndex];
    imageCounterEl.textContent = `Image ${currentIndex + 1} of ${IMAGES.length}`;
    nextBtn.disabled = false;
    statusEl.textContent = "Default: ACCEPT (click Deny to change)";
  } else {
    imageEl.src = "";
    imageCounterEl.textContent = "No more images.";
    nextBtn.disabled = true;
    statusEl.textContent = "Review complete. You can now download the CSV.";
    submitBtn.disabled = false;
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
  decisions = [];
  appDiv.classList.remove("hidden");
  submitBtn.disabled = true;
  updateUI();
});

function recordDecision(decision) {
  if (currentIndex >= IMAGES.length) return;

  const imagePath = IMAGES[currentIndex];
  const existing = decisions.find(d => d.image === imagePath);
  if (existing) {
    existing.decision = decision;
  } else {
    decisions.push({ image: imagePath, decision });
  }

  statusEl.textContent = `You chose: ${decision.toUpperCase()} for this image.`;
}

acceptBtn.addEventListener("click", () => recordDecision("accept"));
denyBtn.addEventListener("click", () => recordDecision("deny"));

nextBtn.addEventListener("click", () => {
  if (currentIndex >= IMAGES.length) return;

  const imagePath = IMAGES[currentIndex];
  let existing = decisions.find(d => d.image === imagePath);

  if (!existing) {
    decisions.push({ image: imagePath, decision: "accept" });
  }

  currentIndex += 1;
  updateUI();
});

// Utility: escape a cell for CSV
function csvEscape(value) {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

submitBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  if (!username) {
    alert("Missing username.");
    return;
  }
  if (decisions.length === 0) {
    alert("No decisions to export.");
    return;
  }

  const now = new Date();
  const isoTimestamp = now.toISOString();

  const header = ["timestamp", "username", "image", "decision"];
  const rows = [header];

  decisions.forEach(d => {
    rows.push([isoTimestamp, username, d.image, d.decision]);
  });

  const csvLines = rows.map(
    cols => cols.map(csvEscape).join(",")
  );
  const csvContent = csvLines.join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

  const pad = n => String(n).padStart(2, "0");
  const tsForFilename = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const safeUser = username.replace(/[^a-zA-Z0-9_-]/g, "_") || "user";

  const filename = `image_review_${safeUser}_${tsForFilename}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  statusEl.textContent = `CSV downloaded as ${filename}`;
});