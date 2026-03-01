"use strict";

/* ── Constants ─────────────────────────────────────────────────────────────── */

const EPOCH = new Date("2025-06-01T00:00:00+02:00");

/* ── State ─────────────────────────────────────────────────────────────────── */

let videos = [];
let targetVideo = null;
let guesses = [];
let solved = false;
let gaveUp = false;
let gameOver = false;
let freePlayTarget = null;

const RANGE_KEYS = ["upload_date", "views", "length"];
let rangeBoundaryIds = { upload_date: new Set(), views: new Set(), length: new Set() };
let activeDropdownIdx = -1;
let exactSearchMode = false;
let gameMode = "standard"; // "einfach" | "standard" | "schwer"

/* ── DOM refs ──────────────────────────────────────────────────────────────── */

const app = document.getElementById("app");
const input = document.getElementById("video-input");
const dropdown = document.getElementById("dropdown");
const guessesEl = document.getElementById("guesses");
const columnHeaders = document.getElementById("column-headers");
const banner = document.getElementById("banner");
const countdownArea = document.getElementById("countdown-area");
const countdownEl = document.getElementById("countdown");
const gameModeToggle = document.getElementById("game-mode-toggle");
const searchModeToggle = document.getElementById("search-mode-toggle");

/* ── Timezone helper: Europe/Berlin ────────────────────────────────────────── */

function berlinNow() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" })
  );
}

function berlinDateStr() {
  const d = berlinNow();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ── Seeded shuffle (deterministic daily pick) ─────────────────────────────── */

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed;
  function rng() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dayIndex() {
  const now = berlinNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - EPOCH) / 86400000);
}

function pickTarget() {
  if (freePlayTarget) return freePlayTarget;
  const seed = hashStr("ghgdle-shuffle-seed-v1");
  const ids = videos.map((v) => v.id);
  const shuffled = seededShuffle(ids, seed);
  const idx = ((dayIndex() % shuffled.length) + shuffled.length) % shuffled.length;
  return videos.find((v) => v.id === shuffled[idx]);
}

function getRangeValue(video, key) {
  if (key === "upload_date") return video.upload_date || "";
  if (key === "views") return Number(video.views) || 0;
  if (key === "length") return Number(video.length) || 0;
  return null;
}

function getRangeBoundaryIds(guessesList, target) {
  const out = { upload_date: new Set(), views: new Set(), length: new Set() };
  for (const key of RANGE_KEYS) {
    const t = getRangeValue(target, key);
    let bestBelow = null;
    let bestAbove = null;
    for (const g of guessesList) {
      const v = getRangeValue(g, key);
      if (v === t) continue;
      if (v < t) {
        if (!bestBelow || v > getRangeValue(bestBelow, key)) bestBelow = g;
      }
      if (v > t) {
        if (!bestAbove || v < getRangeValue(bestAbove, key)) bestAbove = g;
      }
    }
    if (bestBelow) out[key].add(bestBelow.id);
    if (bestAbove) out[key].add(bestAbove.id);
  }
  return out;
}

function getUploadDateRange(guessesList, target) {
  const t = getRangeValue(target, "upload_date");
  let minDate = "";
  let maxDate = "9999-12-31";
  for (const g of guessesList) {
    const v = getRangeValue(g, "upload_date");
    if (v === t) continue;
    if (v < t && (minDate === "" || v > minDate)) minDate = v;
    if (v > t && (maxDate === "9999-12-31" || v < maxDate)) maxDate = v;
  }
  return { minDate, maxDate };
}

/* ── LocalStorage ──────────────────────────────────────────────────────────── */

function storageKey() {
  return `ghgdle-${berlinDateStr()}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState() {
  if (freePlayTarget) return;
  localStorage.setItem(
    storageKey(),
    JSON.stringify({ guesses: guesses.map((v) => v.id), solved, gaveUp })
  );
}

/* ── Formatting helpers ────────────────────────────────────────────────────── */

function formatViews(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".0", "") + "K";
  return String(n);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/* ── Comparison logic ──────────────────────────────────────────────────────── */

function compareChar(guessVideo, targetVideo, key) {
  const gVal = guessVideo[key];
  const tVal = targetVideo[key];

  if (key === "guests") {
    return compareGuests(gVal, tVal);
  }

  if (key === "upload_date") {
    if (gVal === tVal) return { status: "match", arrow: null };
    return {
      status: "miss",
      arrow: gVal < tVal ? "up" : "down",
    };
  }

  if (key === "views" || key === "length") {
    if (gVal === tVal) return { status: "match", arrow: null };
    return {
      status: "miss",
      arrow: gVal < tVal ? "up" : "down",
    };
  }

  if (key === "zickzack_version" || key === "project") {
    if (!gVal && !tVal) return { status: "match", arrow: null };
    if (gVal === tVal) return { status: "match", arrow: null };
    return { status: "miss", arrow: null };
  }

  return { status: "miss", arrow: null };
}

function compareGuests(guessGuests, targetGuests) {
  const gSet = new Set(guessGuests || []);
  const tSet = new Set(targetGuests || []);

  if (gSet.size === 0 && tSet.size === 0) {
    return { status: "match", arrow: null };
  }

  const gArr = [...gSet];
  const tArr = [...tSet];

  if (
    gSet.size === tSet.size &&
    gArr.every((g) => tSet.has(g))
  ) {
    return { status: "match", arrow: null };
  }

  const overlap = gArr.filter((g) => tSet.has(g));

  if (overlap.length === 0) {
    return { status: "miss", arrow: null };
  }

  const missingFromTarget = tArr.filter((t) => !gSet.has(t));
  const extraInGuess = gArr.filter((g) => !tSet.has(g));

  if (missingFromTarget.length > 0 && extraInGuess.length > 0) {
    return { status: "partial", arrow: "up" };
  }
  if (missingFromTarget.length > 0) {
    return { status: "partial", arrow: "up" };
  }
  if (extraInGuess.length > 0) {
    return { status: "partial", arrow: "down" };
  }

  return { status: "partial", arrow: null };
}

/* ── Display value for a characteristic ────────────────────────────────────── */

function displayValue(video, key) {
  switch (key) {
    case "upload_date":
      return formatDate(video.upload_date);
    case "zickzack_version":
      return video.zickzack_version || "–";
    case "views":
      return formatViews(video.views);
    case "length":
      return formatDuration(video.length);
    case "project":
      return video.project || "–";
    case "guests":
      return (video.guests && video.guests.length)
        ? video.guests.join(", ")
        : "Solo";
    default:
      return "";
  }
}

/* ── Build a guess row ─────────────────────────────────────────────────────── */

const CHAR_KEYS = [
  "upload_date",
  "zickzack_version",
  "views",
  "length",
  "project",
  "guests",
];

function createGuessRow(guessVideo) {
  const row = document.createElement("div");
  row.className = "guess-row";

  const thumbLink = document.createElement("a");
  thumbLink.href = `https://www.youtube.com/watch?v=${guessVideo.id}`;
  thumbLink.target = "_blank";
  thumbLink.rel = "noopener noreferrer";
  thumbLink.className = "guess-thumb";
  thumbLink.title = guessVideo.title;
  const img = document.createElement("img");
  img.src = guessVideo.thumbnail;
  img.alt = guessVideo.title;
  img.loading = "lazy";
  img.onerror = () => {
    img.style.display = "none";
    const fallback = document.createElement("span");
    fallback.className = "thumb-fallback";
    fallback.textContent = "▶";
    thumbLink.appendChild(fallback);
  };
  thumbLink.appendChild(img);
  row.appendChild(thumbLink);

  const title = document.createElement("div");
  title.className = "guess-title";
  title.textContent = guessVideo.title;
  row.appendChild(title);

  for (const key of CHAR_KEYS) {
    const result = compareChar(guessVideo, targetVideo, key);
    const box = document.createElement("div");
    let boxClass = `char-box ${result.status}`;
    if (result.status === "miss" && RANGE_KEYS.includes(key) && !rangeBoundaryIds[key].has(guessVideo.id)) {
      boxClass += " miss-far";
    }
    box.className = boxClass;
    if (key === "guests") box.classList.add("char-guests");

    if (
      (key === "zickzack_version" && !guessVideo.zickzack_version && !targetVideo.zickzack_version) ||
      (key === "project" && !guessVideo.project && !targetVideo.project) ||
      (key === "guests" && (!guessVideo.guests || !guessVideo.guests.length) && (!targetVideo.guests || !targetVideo.guests.length))
    ) {
      if (result.status === "match") {
        box.classList.remove("match");
        box.classList.add("empty-val");
      }
    }

    const val = document.createElement("span");
    val.className = "char-value";
    val.textContent = displayValue(guessVideo, key);
    box.appendChild(val);

    if (result.arrow) {
      const arrow = document.createElement("span");
      arrow.className = `char-arrow arrow-${result.arrow}`;
      arrow.textContent = result.arrow === "up" ? "▲" : "▼";
      box.appendChild(arrow);
    }

    row.appendChild(box);
  }

  return row;
}

/* ── UI updates ────────────────────────────────────────────────────────────── */

function addGuessToUI(guessVideo) {
  columnHeaders.classList.remove("hidden");
  rangeBoundaryIds = getRangeBoundaryIds(guesses, targetVideo);
  guessesEl.innerHTML = "";
  for (let i = guesses.length - 1; i >= 0; i--) {
    guessesEl.appendChild(createGuessRow(guesses[i]));
  }
}

function showBanner(type, text) {
  banner.textContent = text;
  banner.className = `banner ${type}`;
}

function endGame(won) {
  gameOver = true;
  document.getElementById("input-area").classList.add("hidden");
  document.getElementById("give-up-area").classList.add("hidden");
  countdownArea.classList.remove("hidden");

  if (won) {
    showBanner("win", `Richtig! In ${guesses.length} Versuch${guesses.length > 1 ? "en" : ""}.`);
  } else {
    showBanner("lose", `Das war: ${targetVideo.title}`);
  }
  startCountdown();
  saveState();
}

function startNewFreePlay() {
  freePlayTarget = videos[Math.floor(Math.random() * videos.length)];
  targetVideo = freePlayTarget;
  guesses = [];
  solved = false;
  gaveUp = false;
  gameOver = false;
  rangeBoundaryIds = { upload_date: new Set(), views: new Set(), length: new Set() };

  banner.classList.add("hidden");
  banner.textContent = "";
  document.getElementById("input-area").classList.remove("hidden");
  document.getElementById("give-up-area").classList.remove("hidden");
  document.getElementById("first-guess-prompt")?.classList.remove("hidden");
  countdownArea.classList.add("hidden");
  columnHeaders.classList.add("hidden");
  guessesEl.innerHTML = "";
}

/* ── Countdown (Europe/Berlin midnight) ────────────────────────────────────── */

function startCountdown() {
  function tick() {
    const now = berlinNow();
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );
    const diff = tomorrow - now;
    if (diff <= 0) {
      location.reload();
      return;
    }
    const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
    countdownEl.textContent = `${h}:${m}:${s}`;
  }
  tick();
  setInterval(tick, 1000);
}

/* ── Search / filter ───────────────────────────────────────────────────────── */

function matchesQuery(query, title) {
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  if (exactSearchMode) {
    return t.includes(q);
  }
  // Token mode: each space-separated token must appear somewhere in the title
  return q.split(/\s+/).filter(Boolean).every((tok) => t.includes(tok));
}

function getFiltered() {
  const raw = input.value;
  const q = exactSearchMode ? raw : raw.trim();
  const guessedIds = new Set(guesses.map((v) => v.id));
  let pool = videos.filter((v) => !guessedIds.has(v.id));

  if (gameMode === "einfach" && targetVideo) {
    const { minDate, maxDate } = getUploadDateRange(guesses, targetVideo);
    pool = pool.filter((v) => {
      const d = v.upload_date || "";
      return (minDate === "" || d >= minDate) && (maxDate === "9999-12-31" || d <= maxDate);
    });
  }

  if (!q.trim()) return pool.slice(0, 100);
  return pool.filter((v) => matchesQuery(q, v.title)).slice(0, 100);
}

/* ── Search mode toggle ────────────────────────────────────────────────────── */

function applySearchMode(exact) {
  exactSearchMode = exact;
  searchModeToggle.querySelectorAll(".mode-opt").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === (exact ? "exact" : "token"));
  });
  renderDropdown();
}

searchModeToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-opt");
  if (btn) applySearchMode(btn.dataset.mode === "exact");
});

applySearchMode(false);

function getDropdownMeta(v) {
  if (gameMode === "schwer") return "";
  if (gameMode === "einfach") {
    const parts = [
      formatDate(v.upload_date),
      v.zickzack_version || "–",
      formatViews(v.views) + " Aufrufe",
      formatDuration(v.length),
      v.project || "–",
    ];
    return parts.join(" · ");
  }
  return `${formatDate(v.upload_date)} · ${formatViews(v.views)} Aufrufe · ${formatDuration(v.length)}`;
}

function renderDropdown() {
  const items = getFiltered();
  if (!items.length || gameOver) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    activeDropdownIdx = -1;
    return;
  }
  dropdown.classList.remove("hidden");
  activeDropdownIdx = -1;

  const showThumb = gameMode !== "schwer";
  const meta = getDropdownMeta(items[0]); // same format for all in this mode

  dropdown.innerHTML = items
    .map(
      (v, i) =>
        `<div class="dropdown-item" data-id="${v.id}" data-idx="${i}">` +
        (showThumb ? `<img class="dd-thumb" src="${v.thumbnail}" alt="" loading="lazy">` : "") +
        `<div class="dd-info">` +
        `<div class="dd-title">${escapeHtml(v.title)}</div>` +
        (meta ? `<div class="dd-meta">${getDropdownMeta(v)}</div>` : "") +
        `</div></div>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function selectVideo(id) {
  const v = videos.find((x) => x.id === id);
  if (!v) return;
  input.value = v.title;
  input.dataset.videoId = id;
  dropdown.classList.add("hidden");
  activeDropdownIdx = -1;
  submitGuess();
}

/* ── Dropdown events ───────────────────────────────────────────────────────── */

dropdown.addEventListener("click", (e) => {
  const item = e.target.closest(".dropdown-item");
  if (item) selectVideo(item.dataset.id);
});

input.addEventListener("input", () => {
  delete input.dataset.videoId;
  renderDropdown();
});

input.addEventListener("focus", () => {
  renderDropdown();
});

input.addEventListener("keydown", (e) => {
  const items = dropdown.querySelectorAll(".dropdown-item");
  if (!items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeDropdownIdx = Math.min(activeDropdownIdx + 1, items.length - 1);
    items.forEach((it, i) =>
      it.classList.toggle("active", i === activeDropdownIdx)
    );
    items[activeDropdownIdx]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeDropdownIdx = Math.max(activeDropdownIdx - 1, 0);
    items.forEach((it, i) =>
      it.classList.toggle("active", i === activeDropdownIdx)
    );
    items[activeDropdownIdx]?.scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (activeDropdownIdx >= 0 && items[activeDropdownIdx]) {
      selectVideo(items[activeDropdownIdx].dataset.id);
    } else if (items.length === 1) {
      selectVideo(items[0].dataset.id);
    }
  } else if (e.key === "Escape") {
    dropdown.classList.add("hidden");
    activeDropdownIdx = -1;
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#input-area") && !e.target.closest("#dropdown")) {
    dropdown.classList.add("hidden");
    activeDropdownIdx = -1;
  }
});

/* ── Guess submission ──────────────────────────────────────────────────────── */

function submitGuess() {
  if (gameOver) return;

  const id = input.dataset.videoId;
  if (!id) return;

  const guessedIds = new Set(guesses.map((v) => v.id));
  if (guessedIds.has(id)) return;

  const guessVideo = videos.find((v) => v.id === id);
  if (!guessVideo) return;

  input.value = "";
  delete input.dataset.videoId;
  dropdown.classList.add("hidden");

  guesses.push(guessVideo);
  addGuessToUI(guessVideo);

  document.getElementById("first-guess-prompt")?.classList.add("hidden");

  solved = guessVideo.id === targetVideo.id;
  saveState();

  if (solved) {
    endGame(true);
  }
}

/* ── Give-up (hold-to-confirm) button ─────────────────────────────────────── */

(function () {
  const btn = document.getElementById("give-up-btn");
  const progress = document.getElementById("give-up-progress");
  const HOLD_MS = 2000;
  let rafId = null;
  let startTime = null;

  function startHold() {
    if (gameOver) return;
    startTime = performance.now();
    btn.classList.add("holding");
    progress.style.transition = "none";
    progress.style.width = "0%";

    function tick() {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, (elapsed / HOLD_MS) * 100);
      progress.style.width = pct + "%";
      if (pct < 100) {
        rafId = requestAnimationFrame(tick);
      } else {
        triggerReveal();
      }
    }
    rafId = requestAnimationFrame(tick);
  }

  function cancelHold() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    startTime = null;
    btn.classList.remove("holding");
    progress.style.transition = "width 0.3s ease";
    progress.style.width = "0%";
  }

  function triggerReveal() {
    cancelHold();
    if (!targetVideo || gameOver) return;
    gaveUp = true;
    const alreadyGuessed = guesses.some((v) => v.id === targetVideo.id);
    if (!alreadyGuessed) {
      guesses.push(targetVideo);
      addGuessToUI(targetVideo);
    }
    endGame(false);
  }

  btn.addEventListener("mousedown", startHold);
  btn.addEventListener("touchstart", (e) => { e.preventDefault(); startHold(); }, { passive: false });
  window.addEventListener("mouseup", cancelHold);
  window.addEventListener("touchend", cancelHold);
  btn.addEventListener("mouseleave", cancelHold);
})();

/* ── Advanced mode toggle ──────────────────────────────────────────────────── */

function applyGameMode(mode) {
  gameMode = mode;
  if (app) {
    app.classList.remove("game-mode-einfach", "game-mode-standard", "game-mode-schwer");
    app.classList.add("game-mode-" + mode);
  }
  if (gameModeToggle) {
    gameModeToggle.querySelectorAll(".mode-opt").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
  }
  localStorage.setItem("ghgdle-game-mode", mode);
  if (typeof renderDropdown === "function") renderDropdown();
}

if (gameModeToggle) {
  gameModeToggle.querySelectorAll(".mode-opt").forEach((btn) => {
    btn.addEventListener("click", () => applyGameMode(btn.dataset.mode));
  });
}

applyGameMode(localStorage.getItem("ghgdle-game-mode") || "standard");

document.getElementById("regenerate-btn").addEventListener("click", startNewFreePlay);

/* ── Project list (Hinweis zu den Daten) ──────────────────────────────────── */

function renderProjectList() {
  const summaryEl = document.getElementById("project-list-summary");
  const contentEl = document.getElementById("project-list-content");
  const btn = document.getElementById("project-list-btn");
  if (!summaryEl || !contentEl || !btn || !videos.length) return;

  const counts = {};
  for (const v of videos) {
    const name = (v.project && String(v.project).trim()) ? String(v.project).trim() : "–";
    counts[name] = (counts[name] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const projectCount = sorted.length;
  const videoCount = videos.length;
  const fullText = sorted
    .map(([name, n]) => `${name} (${n} Video${n !== 1 ? "s" : ""})`)
    .join(", ");

  summaryEl.textContent = `${projectCount} Projekt${projectCount !== 1 ? "e" : ""}, ${videoCount} Video${videoCount !== 1 ? "s" : ""}`;
  contentEl.textContent = fullText || "–";

  btn.addEventListener("click", () => {
    contentEl.classList.toggle("hidden");
    btn.classList.toggle("open", !contentEl.classList.contains("hidden"));
  });
}

/* ── Initialisation ────────────────────────────────────────────────────────── */

async function init() {
  try {
    const res = await fetch("data/videos.json");
    videos = await res.json();
  } catch (err) {
    console.error("Could not load video data:", err);
    banner.textContent = "Fehler beim Laden der Videodaten.";
    banner.className = "banner lose";
    return;
  }

  if (!videos.length) {
    banner.textContent = "Keine Videodaten vorhanden.";
    banner.className = "banner lose";
    return;
  }

  renderProjectList();

  targetVideo = pickTarget();
  if (!targetVideo) {
    console.error("Could not pick target video.");
    return;
  }

  const saved = loadState();
  if (saved && saved.guesses && saved.guesses.length) {
    for (const id of saved.guesses) {
      const v = videos.find((x) => x.id === id);
      if (v) {
        guesses.push(v);
        addGuessToUI(v);
      }
    }
    document.getElementById("first-guess-prompt")?.classList.add("hidden");
    solved = !!saved.solved;
    gaveUp = !!saved.gaveUp;
    if (solved) {
      endGame(true);
    } else if (gaveUp) {
      endGame(false);
    }
  }
}

init();
