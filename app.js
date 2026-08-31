/* Triptych slot engine: pick a provider for each slot's category, pull a
   pooled random item, avoid recent repeats, fall through gracefully. */

"use strict";

const PLATES = ["Pl. I", "Pl. II", "Pl. III"];
const SLOTS_KEY = "triptych.slots.v2";
const RECENT_KEY = "triptych.recent";
const RECENT_MAX = 90;
const POOL_TTL = 30 * 60e3;

const pools = new Map();     // "provider:cat" -> { items, idx }
const inflight = new Map();  // "provider:cat" -> Promise<pool>
const slots = [];

let recent = [];
try { recent = JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { /* fresh start */ }
const recentSet = new Set(recent);

function pushRecent(link) {
  if (!link || recentSet.has(link)) return;
  recentSet.add(link);
  recent.push(link);
  while (recent.length > RECENT_MAX) recentSet.delete(recent.shift());
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* fine */ }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* Weighted order without replacement (Efraimidis–Spirakis). */
function weightedOrder(providers) {
  return providers
    .map((p) => ({ p, key: Math.pow(Math.random(), 1 / (p.weight || 1)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.p);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/* Some archives sit behind bot protection that varies by network and
   browser. Two consecutive failures bench a provider for 10 minutes so
   blocked sources cost nothing; one success clears the record. */
const health = new Map(); // provider.id -> { strikes, coolUntil }

function providerAvailable(p) {
  const h = health.get(p.id);
  return !h || h.coolUntil < Date.now();
}

function recordFailure(p) {
  const h = health.get(p.id) || { strikes: 0, coolUntil: 0 };
  h.strikes++;
  if (h.strikes >= 2) {
    h.coolUntil = Date.now() + 10 * 60e3;
    h.strikes = 0;
  }
  health.set(p.id, h);
}

function recordSuccess(p) {
  health.delete(p.id);
}

/* ---------- pools ---------- */

/* bump the version when provider queries or item shapes change so stale pools die */
function poolStorageKey(key) { return "triptych.pool.v7." + key; }

const ALL_CAT_IDS = new Set([
  "any",
  ...CATEGORY_GROUPS.flatMap((g) => g.cats.map((c) => c.id)),
]);

function loadStoredPool(key) {
  try {
    const s = JSON.parse(sessionStorage.getItem(poolStorageKey(key)));
    if (s && Date.now() - s.t < POOL_TTL && Array.isArray(s.items)) {
      return { items: s.items, idx: s.idx || 0 };
    }
  } catch { /* ignore */ }
  return null;
}

function storePool(key, pool) {
  try {
    sessionStorage.setItem(
      poolStorageKey(key),
      JSON.stringify({ t: Date.now(), items: pool.items, idx: pool.idx })
    );
  } catch { /* storage full — in-memory pool still works */ }
}

async function refillPool(provider, cat, key) {
  let pending = inflight.get(key);
  if (!pending) {
    pending = provider.fetchPool(cat).then((items) => {
      const pool = { items: shuffle(items.filter((it) => it && it.img)), idx: 0 };
      pools.set(key, pool);
      storePool(key, pool);
      return pool;
    });
    inflight.set(key, pending);
    pending.finally(() => inflight.delete(key));
  }
  return pending;
}

/* Next unseen item from this provider's pool, refilling once if drained. */
async function nextItem(provider, cat) {
  const key = provider.id + ":" + cat;
  let pool = pools.get(key) || loadStoredPool(key);
  if (pool) pools.set(key, pool);
  for (let round = 0; round < 2; round++) {
    if (!pool || pool.idx >= pool.items.length) {
      pool = await refillPool(provider, cat, key);
    }
    while (pool.idx < pool.items.length) {
      const item = pool.items[pool.idx++];
      if (!recentSet.has(item.link)) {
        storePool(key, pool);
        return item;
      }
    }
    /* everything here was shown recently — one fresh fetch, then give up */
    pool = null;
    pools.delete(key);
  }
  return null;
}

/* ---------- rendering ---------- */

function loadImage(imgEl, src) {
  return new Promise((resolve, reject) => {
    imgEl.onload = () => resolve();
    imgEl.onerror = () => reject(new Error("image failed"));
    imgEl.src = src;
  });
}

/* Reject postage stamps — a sub-420px image floating in the frame reads
   as a mistake, and the pools are deep enough to skip to the next item. */
const MIN_IMAGE_SIDE = 420;

async function showItem(slot, item) {
  const bigEnough = () =>
    Math.max(slot.img.naturalWidth, slot.img.naturalHeight) >= MIN_IMAGE_SIDE;
  try {
    await withTimeout(loadImage(slot.img, item.img), 20000);
    if (!bigEnough()) throw new Error("too small");
  } catch (err) {
    if (!item.fallback) throw err;
    await withTimeout(loadImage(slot.img, item.fallback), 15000);
    if (!bigEnough()) throw new Error("too small");
  }
}

/* TMDB's terms want their mark shown wherever their content is, so the
   logo rides along with the source line — on screen and in downloads —
   not only in the about panel. */
const TMDB_LOGO_SRC = "tmdb-logo.svg";

function setLabel(slot, { title, source, link }) {
  slot.titleLink.textContent = title;
  if (link) slot.titleLink.href = link;
  else slot.titleLink.removeAttribute("href");
  slot.source.replaceChildren();
  if (source === "TMDB") {
    const logo = document.createElement("img");
    logo.src = TMDB_LOGO_SRC;
    logo.alt = "";
    logo.className = "source-logo";
    slot.source.append(logo);
  }
  slot.source.append(document.createTextNode(source));
}

/* ---------- zoom & pan within a slot ---------- */

function applyZoom(slot) {
  const z = slot.zoom;
  slot.img.style.transform =
    z.s > 1 ? `translate(${z.tx}px, ${z.ty}px) scale(${z.s})` : "";
  slot.el.dataset.zoomed = z.s > 1 ? "true" : "false";
}

function resetZoom(slot) {
  slot.zoom = { s: 1, tx: 0, ty: 0 };
  applyZoom(slot);
}

function clampPan(slot) {
  const z = slot.zoom;
  const mx = (slot.img.clientWidth * (z.s - 1)) / 2 + 60;
  const my = (slot.img.clientHeight * (z.s - 1)) / 2 + 60;
  z.tx = Math.max(-mx, Math.min(mx, z.tx));
  z.ty = Math.max(-my, Math.min(my, z.ty));
}

function initZoom(slot) {
  slot.zoom = { s: 1, tx: 0, ty: 0 };
  const frame = slot.frame;
  let dragging = false;
  let moved = 0;
  let lx = 0, ly = 0;
  let suppressClick = false;

  frame.addEventListener("wheel", (e) => {
    if (slot.viewer || slot.el.dataset.state !== "ready") return;
    e.preventDefault();
    const z = slot.zoom;
    const ns = Math.min(8, Math.max(1, z.s * Math.exp(-e.deltaY * 0.0016)));
    if (ns === z.s) return;
    const fr = frame.getBoundingClientRect();
    const px = e.clientX - (fr.left + fr.width / 2);
    const py = e.clientY - (fr.top + fr.height / 2);
    const k = ns / z.s;
    z.tx = px - k * (px - z.tx);
    z.ty = py - k * (py - z.ty);
    z.s = ns;
    if (z.s === 1) { z.tx = 0; z.ty = 0; }
    clampPan(slot);
    applyZoom(slot);
  }, { passive: false });

  frame.addEventListener("pointerdown", (e) => {
    if (slot.viewer || slot.zoom.s <= 1 || e.button !== 0) return;
    dragging = true;
    moved = 0;
    lx = e.clientX;
    ly = e.clientY;
    frame.setPointerCapture(e.pointerId);
  });

  frame.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx;
    const dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    slot.zoom.tx += dx;
    slot.zoom.ty += dy;
    clampPan(slot);
    applyZoom(slot);
  });

  frame.addEventListener("pointerup", () => {
    if (dragging && moved > 5) suppressClick = true;
    dragging = false;
  });

  frame.addEventListener("click", (e) => {
    if (suppressClick || slot.zoom.s > 1) {
      e.preventDefault();
      suppressClick = false;
    }
  });

  frame.addEventListener("dblclick", (e) => {
    if (slot.zoom.s > 1) {
      e.preventDefault();
      resetZoom(slot);
    }
  });
}

/* The crop currently visible in a zoomed slot, as fractions of the image
   (fractions survive the export falling back to a different-sized copy). */
function visibleCrop(slot) {
  if (!slot.zoom || slot.zoom.s <= 1.001) return null;
  const ir = slot.img.getBoundingClientRect();
  const fr = slot.frame.getBoundingClientRect();
  const L = Math.max(fr.left, ir.left);
  const R = Math.min(fr.right, ir.right);
  const T = Math.max(fr.top, ir.top);
  const B = Math.min(fr.bottom, ir.bottom);
  if (R - L < 8 || B - T < 8) return null;
  return {
    fx: (L - ir.left) / ir.width,
    fy: (T - ir.top) / ir.height,
    fw: (R - L) / ir.width,
    fh: (B - T) / ir.height,
  };
}

/* ---------- interactive 3D viewer (Sketchfab-backed items) ---------- */

function stopViewer(slot) {
  if (slot.viewer) {
    slot.viewer.remove();
    slot.viewer = null;
  }
  slot.viewerApi = null;
  slot.frame.draggable = true;
  if (slot.current?.link) slot.frame.href = slot.current.link;
  slot.rotateBtn.setAttribute("aria-pressed", "false");
}

/* Every Sketchfab link carries the model's 32-hex uid, so an embed URL can
   always be rebuilt from it. Deriving rather than trusting a stored field
   keeps the 3D button working for items cached or saved to history before
   that field existed. */
function embedFor(c) {
  if (!c) return null;
  if (c.sfEmbed) return c.sfEmbed;
  if (!/sketchfab\.com/i.test(c.link || "")) return null;
  const uid = (c.link.match(/([a-f0-9]{32})/i) || [])[1];
  return uid ? `https://sketchfab.com/models/${uid}/embed` : null;
}

/* Sketchfab's Viewer API (loaded lazily, only when a viewer opens) lets us
   capture the CURRENT camera view for downloads via getScreenShot. */
let sfSDKPromise = null;

function loadSketchfabSDK() {
  if (window.Sketchfab) return Promise.resolve(window.Sketchfab);
  if (!sfSDKPromise) {
    sfSDKPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js";
      s.onload = () => resolve(window.Sketchfab);
      s.onerror = () => { sfSDKPromise = null; reject(new Error("sdk load failed")); };
      document.head.append(s);
    });
  }
  return sfSDKPromise;
}

async function toggleViewer(slot) {
  if (slot.viewer) {
    stopViewer(slot);
    return;
  }
  const embed = embedFor(slot.current);
  if (!embed) return;
  const frame = document.createElement("iframe");
  frame.className = "viewer";
  frame.allow = "autoplay; fullscreen; xr-spatial-tracking";
  frame.title = `${slot.current.title} — interactive 3D viewer`;
  /* The panel is an <a>, and on desktop a mouse drag inside a link starts
     a native link-drag instead of reaching the viewer's canvas — so
     orbiting worked on touch only. Neutralise the anchor while the viewer
     is open; stopViewer puts it back. */
  slot.frame.draggable = false;
  slot.frame.removeAttribute("href");
  slot.frame.append(frame);
  slot.viewer = frame;
  slot.viewerApi = null;
  slot.rotateBtn.setAttribute("aria-pressed", "true");

  const uid = (embed.match(/models\/([a-f0-9]{32})/i) || [])[1];
  let viaApi = false;
  if (uid) {
    try {
      const Sketchfab = await loadSketchfabSDK();
      if (slot.viewer !== frame) return; // closed while the SDK loaded
      viaApi = true;
      const client = new Sketchfab(frame);
      client.init(uid, {
        autostart: 1,
        success: (api) => {
          api.addEventListener("viewerready", () => {
            if (slot.viewer === frame) slot.viewerApi = api;
          });
        },
        error: () => {
          if (slot.viewer === frame) {
            frame.src = embed + (embed.includes("?") ? "&" : "?") + "autostart=1";
          }
        },
      });
    } catch { viaApi = false; }
  }
  if (!viaApi && slot.viewer === frame) {
    frame.src = embed + (embed.includes("?") ? "&" : "?") + "autostart=1";
  }
}

/* Current camera view of an open viewer as an Image, or null. */
async function captureViewer(slot) {
  const api = slot.viewerApi;
  if (!api) return null;
  const fr = slot.frame.getBoundingClientRect();
  const w = 1400;
  /* follow the on-screen frame aspect, clamped to sanity in case the
     viewport reports degenerate dimensions */
  const ratio = Math.min(1.8, Math.max(0.55, fr.height / Math.max(fr.width, 1)));
  const h = Math.round(w * ratio);
  const shot = await Promise.race([
    new Promise((resolve) => {
      try {
        api.getScreenShot(w, h, "image/png", (err, result) => resolve(err ? null : result));
      } catch { resolve(null); }
    }),
    new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (!shot) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = shot;
  });
}

async function loadSlot(index) {
  const slot = slots[index];
  const cat = slot.select.value;
  const srcId = slot.srcSelect.value;
  const run = ++slot.run; // stale-response guard
  slot.el.dataset.state = "loading";
  slot.msg.hidden = true;
  stopViewer(slot);
  resetZoom(slot);
  slot.rotateBtn.hidden = true;
  setLabel(slot, { title: "Fetching…", source: "", link: null });

  /* A pinned source is used exactly as asked — no fallback, and the
     circuit breaker doesn't apply to an explicit choice. */
  const pinned =
    srcId !== "any" ? PROVIDERS.find((p) => p.id === srcId && p.enabled()) : null;
  let candidates;
  if (pinned) {
    candidates = pinned.supports(cat) ? [pinned] : [];
  } else {
    candidates = weightedOrder(
      PROVIDERS.filter((p) => p.enabled() && p.supports(cat) && providerAvailable(p))
    );
    if (!candidates.length) {
      candidates = weightedOrder(PROVIDERS.filter((p) => p.enabled() && p.supports(cat)));
    }
  }

  for (const provider of candidates) {
    let imageFailures = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      let item;
      try {
        item = await nextItem(provider, cat);
      } catch {
        recordFailure(provider); // provider fetch failed — try the next one
        break;
      }
      if (!item) break;
      if (slot.run !== run) return; // superseded by a newer request
      try {
        await showItem(slot, item);
        if (slot.run !== run) return;
        recordSuccess(provider);
        slot.el.dataset.state = "ready";
        slot.frame.href = item.link;
        slot.img.alt = `${item.title} — ${provider.name}`;
        setLabel(slot, { title: item.title, source: provider.name, link: item.link });
        pushRecent(item.link);
        slot.current = {
          img: item.img,
          fallback: item.fallback,
          title: item.title,
          link: item.link,
          source: provider.name,
          pid: provider.id,
          sfEmbed: item.sfEmbed || null,
          cat,
          src: srcId,
        };
        slot.rotateBtn.hidden = !embedFor(slot.current);
        updateDownloadHint();
        scheduleCommit();
        return;
      } catch {
        imageFailures++; // image failed — next item
      }
    }
    if (imageFailures >= 3) recordFailure(provider);
    if (slot.run !== run) return;
  }

  slot.el.dataset.state = "error";
  slot.img.removeAttribute("src");
  slot.current = null;
  updateDownloadHint();
  slot.msg.textContent = pinned
    ? `Couldn't reach ${pinned.name}.`
    : "Couldn't reach the archives.";
  slot.msg.hidden = false;
  setLabel(slot, { title: "Nothing to show", source: "Press ↻ to retry", link: null });
}

function newSet() {
  slots.forEach((_, i) => loadSlot(i));
}

/* ---------- set history (last 10 sets, undo/redo style) ---------- */

const HIST_KEY = "triptych.history.v1";
const HIST_MAX = 11; // current state + 10 back

const hist = { entries: [], pos: -1 };
try {
  const stored = JSON.parse(localStorage.getItem(HIST_KEY));
  if (stored && Array.isArray(stored.entries)) {
    hist.entries = stored.entries.slice(-HIST_MAX);
    hist.pos = Math.min(Math.max(stored.pos ?? hist.entries.length - 1, -1),
      hist.entries.length - 1);
  }
} catch { /* fresh history */ }

function saveHist() {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
  } catch { /* storage full — history just won't persist */ }
}

const histBack = document.getElementById("hist-back");
const histFwd = document.getElementById("hist-fwd");

function updateNavButtons() {
  histBack.disabled = hist.pos <= 0;
  histFwd.disabled = hist.pos >= hist.entries.length - 1;
}

/* Commit the visible set once every slot has settled. Called (debounced)
   after each successful slot render; skips while anything is loading and
   dedupes identical states. Acting while browsing history branches from
   that point, like a normal undo stack. */
let commitTimer = null;

function scheduleCommit() {
  clearTimeout(commitTimer);
  commitTimer = setTimeout(tryCommit, 600);
}

function tryCommit() {
  if (slots.some((s) => s.el.dataset.state === "loading")) return;
  if (!slots.every((s) => s.current)) return;
  const state = slots.map((s) => s.current);
  const key = state.map((c) => c.link).join("|");
  if (hist.entries[hist.pos]?.key === key) return;
  hist.entries = hist.entries.slice(0, hist.pos + 1);
  hist.entries.push({ key, slots: state });
  if (hist.entries.length > HIST_MAX) {
    hist.entries = hist.entries.slice(-HIST_MAX);
  }
  hist.pos = hist.entries.length - 1;
  saveHist();
  updateNavButtons();
}

/* Re-render a slot from a stored history entry — no pool fetches, and the
   dropdowns are restored to what produced that set. */
async function renderStored(slot, c) {
  const run = ++slot.run;
  slot.el.dataset.state = "loading";
  slot.msg.hidden = true;
  stopViewer(slot);
  resetZoom(slot);
  slot.rotateBtn.hidden = true;
  if (ALL_CAT_IDS.has(c.cat)) slot.select.value = c.cat;
  if ([...slot.srcSelect.options].some((o) => o.value === c.src)) {
    slot.srcSelect.value = c.src;
  }
  syncCatOptions(slot);
  fitSelect(slot.srcSelect);
  slot.current = c;
  try {
    await showItem(slot, c);
    if (slot.run !== run) return;
    slot.el.dataset.state = "ready";
    slot.frame.href = c.link;
    slot.img.alt = `${c.title} — ${c.source}`;
    setLabel(slot, { title: c.title, source: c.source, link: c.link });
    slot.rotateBtn.hidden = !embedFor(c);
    updateDownloadHint();
  } catch {
    if (slot.run !== run) return;
    slot.el.dataset.state = "error";
    slot.img.removeAttribute("src");
    slot.msg.textContent = "This image is no longer reachable.";
    slot.msg.hidden = false;
    setLabel(slot, { title: "Nothing to show", source: "Press ↻ to retry", link: null });
  }
}

function showHistory(delta) {
  const target = hist.pos + delta;
  if (target < 0 || target >= hist.entries.length) return;
  hist.pos = target;
  saveHist();
  hist.entries[target].slots.forEach((c, i) => renderStored(slots[i], c));
  updateNavButtons();
}

histBack.addEventListener("click", () => showHistory(-1));
histFwd.addEventListener("click", () => showHistory(1));

/* ---------- boot ---------- */

/* ---------- visual category picker ---------- */

/* Tile thumbnails ship with the site as thumbs/<category>.jpg, built once
   by scripts/build-thumbs.mjs. Nothing is fetched or cached at runtime:
   the browser loads a 16KB file per tile, and collapsed groups are
   display:none so their images are never requested at all. */
const GROUPS_KEY = "mnemocine.catGroups.v1";

let groupOpen = {};
try { groupOpen = JSON.parse(localStorage.getItem(GROUPS_KEY)) || {}; } catch { /* fresh */ }

function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* full — fine */ }
}

const thumbFor = (id) => `thumbs/${id}.jpg`;


function makeTile(slot, id, label) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "cat-tile";
  tile.dataset.cat = id;
  const span = document.createElement("span");
  span.className = "tile-label";
  span.textContent = label;
  tile.append(span);
  tile.style.backgroundImage = `url("${thumbFor(id)}")`;
  tile.addEventListener("click", () => {
    if (tile.disabled) return;
    slot.select.value = id;
    slot.select.dispatchEvent(new Event("change"));
    closePicker(slot);
  });
  return tile;
}

function buildPicker(slot) {
  const panel = slot.panel;
  panel.replaceChildren();

  const anyTile = makeTile(slot, "any", "Anything");
  anyTile.classList.add("any");
  panel.append(anyTile);

  for (const group of CATEGORY_GROUPS) {
    const wrap = document.createElement("div");
    wrap.className = "cat-group";
    wrap.dataset.group = group.label;
    /* open the group holding the current pick, so the panel lands on
       something visual rather than five collapsed headers */
    const holdsCurrent = group.cats.some((c) => c.id === slot.select.value);
    const open = groupOpen[group.label] ?? holdsCurrent;
    wrap.dataset.open = String(open);

    const head = document.createElement("button");
    head.type = "button";
    head.className = "cat-group-head";
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = "▶";
    const name = document.createElement("span");
    name.textContent = group.label;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = group.cats.length;
    head.append(chev, name, count);
    head.addEventListener("click", () => {
      const nowOpen = wrap.dataset.open !== "true";
      wrap.dataset.open = String(nowOpen);
      groupOpen[group.label] = nowOpen;
      saveJSON(GROUPS_KEY, groupOpen);
    });

    const tiles = document.createElement("div");
    tiles.className = "cat-tiles";
    for (const c of group.cats) tiles.append(makeTile(slot, c.id, c.label));

    wrap.append(head, tiles);
    panel.append(wrap);
  }
  syncTiles(slot);
}

/* Mirror the <select>'s state onto the tiles: which is current, and which
   the pinned source can't serve. */
function syncTiles(slot) {
  const current = slot.select.value;
  for (const tile of slot.panel.querySelectorAll(".cat-tile")) {
    const id = tile.dataset.cat;
    const opt = [...slot.select.options].find((o) => o.value === id);
    tile.disabled = !!opt?.disabled;
    tile.setAttribute("aria-current", String(id === current));
    /* say why a tile is unavailable rather than just greying it out */
    if (tile.disabled) {
      const dormant = !PROVIDERS.some((p) => p.enabled() && p.supports(id));
      tile.title = dormant
        ? "Needs an API key — see config.js"
        : "This source doesn't cover this category";
    } else {
      tile.removeAttribute("title");
    }
  }
  slot.trigger.textContent =
    slot.select.options[slot.select.selectedIndex]?.textContent || "Anything";
}

function closePicker(slot) {
  slot.panel.hidden = true;
  slot.trigger.setAttribute("aria-expanded", "false");
}

function openPicker(slot) {
  for (const other of slots) if (other !== slot) closePicker(other);
  syncTiles(slot);
  slot.panel.hidden = false;
  slot.trigger.setAttribute("aria-expanded", "true");
}

/* A <select> sizes itself to its longest option; fit it to the chosen one
   so the chevron sits right after the text. */
const measure = document.createElement("span");
measure.className = "sel cat-measure";
document.body.append(measure);

function fitSelect(select) {
  measure.textContent = select.options[select.selectedIndex]?.textContent || "";
  select.style.width = measure.offsetWidth + 14 + "px";
}

function loadStoredSlots() {
  try {
    const v2 = JSON.parse(localStorage.getItem(SLOTS_KEY));
    if (Array.isArray(v2)) return v2;
  } catch { /* fall through */ }
  try { // migrate the old category-only format
    const v1 = JSON.parse(localStorage.getItem("triptych.cats"));
    if (Array.isArray(v1)) return v1.map((cat) => ({ src: "any", cat }));
  } catch { /* fresh start */ }
  return [];
}

function saveSlots() {
  try {
    localStorage.setItem(
      SLOTS_KEY,
      JSON.stringify(slots.map((s) => ({ src: s.srcSelect.value, cat: s.select.value })))
    );
  } catch { /* fine */ }
}

/* When a source is pinned, gray out the categories it doesn't cover. */
function syncCatOptions(slot) {
  const srcId = slot.srcSelect.value;
  const provider = srcId === "any" ? null : PROVIDERS.find((p) => p.id === srcId);
  for (const opt of slot.select.options) {
    /* With no source pinned, a category is still unavailable if every
       archive that serves it is dormant — Modern cinema is TMDB-only, and
       TMDB sits out until a key is pasted into config.js. */
    opt.disabled = provider
      ? !provider.supports(opt.value)
      : !PROVIDERS.some((p) => p.enabled() && p.supports(opt.value));
  }
  if (provider && !provider.supports(slot.select.value)) {
    slot.select.value = "any";
  }
  if (slot.panel) syncTiles(slot);
}

function buildSlots() {
  const row = document.getElementById("row");
  const template = document.getElementById("slot-template");
  const stored = loadStoredSlots();
  const sources = PROVIDERS.filter((p) => p.enabled());

  for (let i = 0; i < 3; i++) {
    const el = template.content.firstElementChild.cloneNode(true);
    const select = el.querySelector(".cat");
    const srcSelect = el.querySelector(".src");

    const anyCat = document.createElement("option");
    anyCat.value = "any";
    anyCat.textContent = "Anything";
    select.append(anyCat);
    for (const group of CATEGORY_GROUPS) {
      const og = document.createElement("optgroup");
      og.label = group.label;
      for (const c of group.cats) {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.label;
        og.append(opt);
      }
      select.append(og);
    }
    const anyOpt = document.createElement("option");
    anyOpt.value = "any";
    anyOpt.textContent = "Any source";
    srcSelect.append(anyOpt);
    for (const p of sources) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.short || p.name;
      srcSelect.append(opt);
    }

    const s = stored[i] || {};
    select.value = ALL_CAT_IDS.has(s.cat) ? s.cat : "any";
    srcSelect.value = sources.some((p) => p.id === s.src) ? s.src : "any";
    select.setAttribute("aria-label", `Category for image ${i + 1}`);
    srcSelect.setAttribute("aria-label", `Source archive for image ${i + 1}`);
    el.querySelector(".plate").textContent = PLATES[i];

    const slot = {
      el,
      select,
      srcSelect,
      frame: el.querySelector(".frame"),
      img: el.querySelector("img"),
      msg: el.querySelector(".frame-msg"),
      titleLink: el.querySelector(".title a"),
      source: el.querySelector(".source"),
      rotateBtn: el.querySelector(".rotate3d"),
      trigger: el.querySelector(".cat-trigger"),
      panel: el.querySelector(".cat-panel"),
      viewer: null,
      run: 0,
    };
    syncCatOptions(slot);
    buildPicker(slot);
    fitSelect(srcSelect);

    slot.trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (slot.panel.hidden) openPicker(slot);
      else closePicker(slot);
    });
    slot.panel.addEventListener("click", (e) => e.stopPropagation());
    slot.rotateBtn.addEventListener("click", () => toggleViewer(slot));
    initZoom(slot);

    select.addEventListener("change", () => {
      syncTiles(slot);
      saveSlots();
      loadSlot(i);
    });
    srcSelect.addEventListener("change", () => {
      syncCatOptions(slot);
      fitSelect(srcSelect);
      saveSlots();
      loadSlot(i);
    });
    el.querySelector(".reroll").addEventListener("click", () => loadSlot(i));

    slots.push(slot);
    row.append(el);
  }
}

document.getElementById("new-set").addEventListener("click", newSet);

/* ---------- download the set as one image ---------- */

const downloadBtn = document.getElementById("download");

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return { bg: v("--bg"), mat: v("--mat"), ink: v("--ink"), muted: v("--muted"), line: v("--line") };
}

/* Re-fetch with crossOrigin so the canvas stays clean and exportable.
   Hosts that don't send CORS headers (the Met, Cleveland) fail here and
   their panel becomes a caption card instead. */
function loadExportImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => reject(new Error("timeout")), 20000);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new Error("not exportable")); };
    img.src = src;
  });
}

/* Archives whose image servers send no CORS headers — embedding is
   impossible by browser policy, not by flakiness. */
function embeddingBlocked(c) {
  if (c.pid) return c.pid === "met" || c.pid === "cma";
  return /\bmet\b|cleveland/i.test(c.source || ""); // pre-pid history entries
}

async function exportPanelImage(c) {
  try { return await loadExportImage(c.img); } catch { /* maybe transient */ }
  if (!embeddingBlocked(c)) {
    await new Promise((r) => setTimeout(r, 700));
    try { return await loadExportImage(c.img); } catch { /* try smaller */ }
  }
  if (c.fallback) {
    try { return await loadExportImage(c.fallback); } catch { /* card */ }
  }
  return null;
}

function drawTruncated(ctx, text, x, y, maxWidth) {
  let s = text;
  while (s.length > 1 && ctx.measureText(s).width > maxWidth) {
    s = s.slice(0, -2).trimEnd() + "…";
  }
  ctx.fillText(s, x, y);
}

function drawWrapped(ctx, text, cx, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const probe = line ? line + " " + word : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = probe;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  else if (line) lines[maxLines - 1] = lines[maxLines - 1].replace(/…?$/, "…");
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

async function downloadSet() {
  if (slots.some((s) => !s.current)) {
    const prev = downloadBtn.textContent;
    downloadBtn.textContent = "Set still loading…";
    setTimeout(() => { downloadBtn.textContent = prev; }, 1600);
    return;
  }
  const items = slots.map((s) => s.current);
  const crops = slots.map(visibleCrop); // capture zoom states before anything async
  const prev = downloadBtn.textContent;
  downloadBtn.disabled = true;
  downloadBtn.textContent = "Rendering…";
  try {
    /* an open 3D viewer contributes its current camera view */
    const liveShots = await Promise.all(slots.map(captureViewer));
    /* same-origin SVG, so drawing it keeps the canvas exportable. An SVG
       needs explicit dimensions before it will draw. */
    const tmdbLogo = items.some((c) => c.source === "TMDB")
      ? await new Promise((resolve) => {
          const img = new Image();
          img.width = 176;
          img.height = 76;
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = TMDB_LOGO_SRC;
        })
      : null;
    const images = await Promise.all(
      items.map((c, i) => liveShots[i] || exportPanelImage(c))
    );
    const PW = 1200, PH = 1360, GAP = 48, PAD = 64, CAPTION = 170;
    const W = PAD * 2 + PW * 3 + GAP * 2;
    const H = PAD * 2 + PH + CAPTION;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const col = themeColors();
    const serif = '"Iowan Old Style", Baskerville, Georgia, serif';
    const sans = "system-ui, sans-serif";

    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, W, H);

    items.forEach((c, i) => {
      const x = PAD + i * (PW + GAP);
      const y = PAD;
      ctx.fillStyle = col.mat;
      ctx.fillRect(x, y, PW, PH);
      ctx.strokeStyle = col.line;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, PW - 2, PH - 2);

      const img = images[i];
      if (img) {
        const m = 44;
        const crop = liveShots[i] ? null : crops[i];
        const sx = crop ? crop.fx * img.naturalWidth : 0;
        const sy = crop ? crop.fy * img.naturalHeight : 0;
        const sw = crop ? crop.fw * img.naturalWidth : img.naturalWidth;
        const sh = crop ? crop.fh * img.naturalHeight : img.naturalHeight;
        const scale = Math.min((PW - 2 * m) / sw, (PH - 2 * m) / sh);
        const w = sw * scale;
        const h = sh * scale;
        ctx.drawImage(img, sx, sy, sw, sh, x + (PW - w) / 2, y + (PH - h) / 2, w, h);
      } else {
        /* caption card — name the real reason */
        const cx = x + PW / 2;
        ctx.textAlign = "center";
        ctx.fillStyle = col.ink;
        ctx.font = `italic 44px ${serif}`;
        const endY = drawWrapped(ctx, c.title, cx, y + PH / 2 - 120, PW - 160, 58, 3);
        ctx.fillStyle = col.muted;
        ctx.font = `26px ${sans}`;
        ctx.fillText(c.source.toUpperCase(), cx, endY + 34);
        ctx.font = `24px ${sans}`;
        if (embeddingBlocked(c)) {
          ctx.fillText(`${c.source} doesn't allow its images`, cx, endY + 106);
          ctx.fillText("to be embedded — view it at the source:", cx, endY + 140);
        } else {
          ctx.fillText("this image couldn't be fetched just now —", cx, endY + 106);
          ctx.fillText("try the download again, or find it at:", cx, endY + 140);
        }
        drawTruncated(ctx, c.link.replace(/^https?:\/\//, ""), cx, endY + 186, PW - 160);
        ctx.textAlign = "left";
      }

      const capY = y + PH + 52;
      ctx.textAlign = "left";
      if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
      ctx.fillStyle = col.muted;
      ctx.font = `600 21px ${sans}`;
      ctx.fillText(PLATES[i].toUpperCase(), x + 2, capY);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      ctx.fillStyle = col.ink;
      ctx.font = `italic 31px ${serif}`;
      drawTruncated(ctx, c.title, x + 2, capY + 46, PW - 4);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      ctx.fillStyle = col.muted;
      ctx.font = `21px ${sans}`;
      /* the mark travels with the file, not just the page */
      const logoW = c.source === "TMDB" && tmdbLogo ? 44 : 0;
      if (logoW) {
        ctx.drawImage(tmdbLogo, x + 2, capY + 71, logoW, 19);
      }
      drawTruncated(ctx, c.source.toUpperCase(), x + 2 + (logoW ? logoW + 10 : 0),
        capY + 86, PW - 4 - logoW);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    });

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("encode failed");
    const ts = new Date();
    const p2 = (n) => String(n).padStart(2, "0");
    const a = document.createElement("a");
    a.download = `mnemocine-${ts.getFullYear()}${p2(ts.getMonth() + 1)}${p2(ts.getDate())}-${p2(ts.getHours())}${p2(ts.getMinutes())}.jpg`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    const cards = images.filter((im) => !im).length;
    if (cards) {
      downloadBtn.textContent = `Saved — ${cards} panel${cards > 1 ? "s" : ""} as text card`;
      setTimeout(() => { downloadBtn.textContent = prev; }, 2800);
    }
  } catch {
    downloadBtn.textContent = "Couldn't render — try again";
    setTimeout(() => { downloadBtn.textContent = prev; }, 2000);
  } finally {
    downloadBtn.disabled = false;
    if (downloadBtn.textContent === "Rendering…") downloadBtn.textContent = prev;
  }
}

downloadBtn.addEventListener("click", downloadSet);

/* Keep the Download tooltip honest about panels that will export as
   text cards (archives whose image servers block embedding). */
function updateDownloadHint() {
  const blocked = slots
    .map((s, i) => (s.current && embeddingBlocked(s.current) ? PLATES[i] : null))
    .filter(Boolean);
  downloadBtn.title = blocked.length
    ? `Save the current three as one image — ${blocked.join(" & ")} will export as ` +
      `text card${blocked.length > 1 ? "s" : ""} (their archives block embedding)`
    : "Save the current three as one image";
}

/* ---------- about panel ---------- */

const aboutToggle = document.getElementById("about-toggle");
const aboutPanel = document.getElementById("about");

function setAbout(open) {
  aboutPanel.hidden = !open;
  aboutToggle.setAttribute("aria-expanded", String(open));
}

aboutToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  setAbout(aboutPanel.hidden);
});

document.addEventListener("click", (e) => {
  if (!aboutPanel.hidden && e.target instanceof Node && !aboutPanel.contains(e.target)) {
    setAbout(false);
  }
  slots.forEach(closePicker);
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (!aboutPanel.hidden) setAbout(false);
    slots.forEach(closePicker);
    return;
  }
  if (e.repeat) return;
  const t = e.target;
  if (t instanceof HTMLElement && t.closest("select, button, input, a")) return;
  if (e.code === "Space") {
    e.preventDefault();
    newSet();
  } else if (e.code === "ArrowLeft") {
    e.preventDefault();
    showHistory(-1);
  } else if (e.code === "ArrowRight") {
    e.preventDefault();
    showHistory(1);
  }
});

buildSlots();
updateNavButtons();
newSet();
