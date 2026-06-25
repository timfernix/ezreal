const STATE = {
  allItems: [],
  filtered: [],
  skin: "all",
  types: new Set([
    "splash", "icon", "promo", "concept",
    "loading", "model", "model-face",
    "chroma", "video", "youtube", "emote", "merch", "tenor", "ingame"
  ]),
  tags: new Set(),
  search: "",
  sortBy: "skin",
  tab: "gallery",
};

/* ------------ performance ------------ */
const RENDER_BATCH = 80;   // cards per chunk
let renderCursor = 0;      // index into STATE.filtered
let io = null;             // IntersectionObserver for infinite scroll

function debounce(fn, delay = 100) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
/* ------------------------------------------- */

const TYPE_LABEL = {
  splash: "Splash",
  icon: "Icon",
  promo: "Promo",
  concept: "Concept",
  loading: "Loading",
  model: "Model",
  "model-face": "Face",
  chroma: "Chroma",
  video: "Video",
  youtube: "YouTube",
  emote: "Emote",
  merch: "Merch",
  tenor: "GIF",
  ingame: "Abilities",
};

const TAG_LABEL = {
  timfernix: "Made by timfernix",
  tft: "TFT",
  wr: "Wild Rift",
  lor: "Legends of Runeterra",
  chroma: "Chroma",
  lol: "League of Legends",
};

const MOVE_NOTICE_STORAGE_KEY = "ezrealMoveNoticeSeen-v1";

const els = {
  skinFilter: document.getElementById("skinFilter"),
  typeChecks: () => [...document.querySelectorAll('input[name="type"]')],
  tagChecks:  () => [...document.querySelectorAll('input[name="tag"]')],
  search: document.getElementById("search"),
  sortBy: document.getElementById("sortBy"),
  gallery: document.getElementById("gallery"),
  files: document.getElementById("files"),
  filesTree: document.getElementById("filesTree"),
  empty: document.getElementById("empty"),
  tabs: () => [...document.querySelectorAll(".tab")],
  themeToggle: document.getElementById("themeToggle"),
  viewer: document.getElementById("viewer"),
  themeMeta: document.getElementById("themeColorMeta"),
  counts: document.getElementById("counts"),
  countTotal: document.getElementById("countTotal"),
  countFiltered: document.getElementById("countFiltered"),
  lastUpdated: document.getElementById("lastUpdated"),
  moveNotice: document.getElementById("moveNotice"),
  moveNoticeDismiss: document.getElementById("moveNoticeDismiss"),
};

function syncFiltersFromUI(){
  STATE.types = new Set(els.typeChecks().filter(cb => cb.checked).map(cb => cb.value));
  STATE.tags  = new Set(els.tagChecks().filter(cb => cb.checked).map(cb => cb.value));

  if (els.skinFilter) STATE.skin = els.skinFilter.value || "all";
  if (els.search)     STATE.search = (els.search.value || "").trim().toLowerCase();
  if (els.sortBy)     STATE.sortBy = els.sortBy.value || "skin";
}

init().catch(console.error);

async function init(){
  hydrateTheme();
  wireUI();
  maybeShowMoveNotice();
  await loadManifest();
  renderFilters();
  syncFiltersFromUI();
  applyFilters();
  renderLastUpdated();
}

function maybeShowMoveNotice(){
  const dlg = els.moveNotice;
  const dismissBtn = els.moveNoticeDismiss;
  if(!dlg || !dismissBtn) return;

  let alreadyShown = false;
  try {
    alreadyShown = localStorage.getItem(MOVE_NOTICE_STORAGE_KEY) === "1";
  } catch (_err) {
    alreadyShown = false;
  }
  if(alreadyShown) return;

  const markSeen = () => {
    try {
      localStorage.setItem(MOVE_NOTICE_STORAGE_KEY, "1");
    } catch (_err) {
    }
  };

  dismissBtn.addEventListener("click", () => {
    markSeen();
    dlg.close();
  }, { once: true });

  dlg.addEventListener("close", markSeen, { once: true });

  if(typeof dlg.showModal === "function") {
    dlg.showModal();
    return;
  }
  dlg.setAttribute("open", "");
}

function updateCounts(){
  if(!els.counts) return;
  const total = STATE.allItems.length;
  const shown = STATE.filtered.length;
  els.counts.innerHTML = `Displaying ${shown} of ${total} items`;
}

function hydrateTheme(){
  const saved = localStorage.getItem("theme");
  if(saved) document.documentElement.setAttribute("data-theme", saved);
  els.themeMeta?.setAttribute("content", (document.documentElement.getAttribute("data-theme")==="dark") ? "#0b0f14" : "#f6f9ff");

  els.themeToggle?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    els.themeMeta?.setAttribute("content", next === "dark" ? "#0b0f14" : "#f6f9ff");
  });
}

function wireUI(){
  const rerender = debounce(applyFilters, 80);

  els.skinFilter?.addEventListener("change", e => { STATE.skin = e.target.value; rerender(); });
  els.typeChecks().forEach(cb => cb.addEventListener("change", ev => {
    const c = ev.currentTarget;
    if(c.checked) STATE.types.add(c.value); else STATE.types.delete(c.value);
    rerender();
  }));
  els.tagChecks().forEach(cb => cb.addEventListener("change", ev => {
    const c = ev.currentTarget;
    if(c.checked) STATE.tags.add(c.value); else STATE.tags.delete(c.value);
    rerender();
  }));
  els.search?.addEventListener("input", e => { STATE.search = e.target.value.trim().toLowerCase(); rerender(); });
  els.sortBy?.addEventListener("change", e => { STATE.sortBy = e.target.value; rerender(); });
  els.tabs().forEach(btn => btn.addEventListener("click", onTab));
  document.addEventListener("keydown", e => { if(e.key === "Escape" && els.viewer.open) els.viewer.close(); });

  els.gallery.addEventListener("click", (e) => {
    const thumb = e.target.closest(".thumb");
    if (thumb) {
      if (thumb.tagName === "VIDEO") return;
      const card = e.target.closest("article.card");
      if (!card) return;
      const idx = Number(card.dataset.idx);
      if (Number.isFinite(idx)) openViewer(STATE.filtered[idx]);
    }

    const copyBtn = e.target.closest("button.js-copy");
    if (copyBtn) {
      const url = copyBtn.getAttribute("data-path") || "";
      (async () => {
        try {
          await navigator.clipboard.writeText(url);
          const old = copyBtn.textContent;
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = old), 1200);
        } catch {
          copyBtn.textContent = "Failed";
          setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
        }
      })();
    }
  });
}

function onTab(e){
  const tab = e.currentTarget.dataset.tab;
  STATE.tab = tab;

  els.tabs().forEach(t => {
    const is = t.dataset.tab === tab;
    t.classList.toggle("active", is);
    t.setAttribute("aria-selected", String(is));
  });

  const galleryActive = tab === "gallery";
  els.gallery.hidden = !galleryActive;
  els.files.hidden = galleryActive;
  if(!galleryActive){
    renderFilesTree();
  }

  els.empty.hidden = !(galleryActive && STATE.filtered.length === 0);
}

async function loadManifest(){
  try{
    const res = await fetch("data/manifest.json", { cache: "no-store" });
    if(!res.ok) throw new Error(`manifest ${res.status}`);
    const data = await res.json();

    MANIFEST_META = data.meta || { generated: null };

    const items = [];
    for(const skin of (data.skins || [])){
      const skinId = skin.id;
      const skinName = skin.name || skinId;
      const year = skin.release_year || null;

      for(const m of (skin.media || [])){
        const tags = normalizeTags(m.tags || []);

        if(m.type === "chroma" && !tags.includes("chroma")) tags.push("chroma");

        const hasGameTag = tags.includes("tft") || tags.includes("wr") || tags.includes("lor");
        if(!hasGameTag) tags.push("lol");

        const title = cleanTitle(m.title || inferTitleFromPath(m.path || m.url, m.youtubeId));
        const searchText = [
          title,
          skinName,
          m.type || "",
          (year || ""),
          ...(tags || [])
        ].join(" ").toLowerCase();

        items.push({
          skinId,
          skinName,
          year,
          type: m.type,
          title,
          path: m.path || null,
          url: m.url || null,
          youtubeId: m.youtubeId || null,
          thumb: m.thumb || null,
          tags,
          searchText,
          isVideo: Boolean(m.isVideo)
        });
      }
    }
    STATE.allItems = items;
  }catch(err){
    console.warn("Failed to load manifest:", err);
    STATE.allItems = [];
    MANIFEST_META = { generated: null };
  }
}

function renderLastUpdated(){
  if (!els.lastUpdated || !MANIFEST_META.generated) return;
  const dt = new Date(MANIFEST_META.generated);
  const formatted = dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  els.lastUpdated.textContent = `Updated ${formatted}`;
}

function renderFilters(){
  const skins = Array.from(new Set(STATE.allItems.map(i => i.skinId)))
    .map(id => ({
      id,
      name: STATE.allItems.find(x => x.skinId === id)?.skinName || id
    }))
    .sort((a,b)=>a.name.localeCompare(b.name));
  for(const s of skins){
    const opt = document.createElement("option");
    opt.value = s.id; opt.textContent = s.name;
    els.skinFilter.appendChild(opt);
  }
}

function applyFilters(){
  let out = STATE.allItems.slice();

  if(STATE.skin !== "all") out = out.filter(i => i.skinId === STATE.skin);
  out = out.filter(i => STATE.types.has(i.type));

  if (STATE.tags.size === 0) {
    out = [];
  } else {
    out = out.filter(i => (i.tags||[]).some(t => STATE.tags.has(t)));
  }

  if(STATE.search){
    const q = STATE.search;
    out = out.filter(i => i.searchText?.includes(q));
  }

  switch(STATE.sortBy){
    case "title": out.sort((a,b)=> (a.title||"").localeCompare(b.title||"")); break;
    case "type":  out.sort((a,b)=> (TYPE_LABEL[a.type]||a.type).localeCompare(TYPE_LABEL[b.type]||b.type)); break;
    case "year":  out.sort((a,b)=> (b.year||0)-(a.year||0) || (a.title||"").localeCompare(b.title||"")); break;
    default:
      out.sort((a,b)=> (a.skinName||"").localeCompare(b.skinName||"")
        || (TYPE_LABEL[a.type]||a.type).localeCompare(TYPE_LABEL[b.type]||b.type)
        || (a.title||"").localeCompare(b.title||""));
  }

  STATE.filtered = out;

  startRender();

  els.empty.hidden = !(STATE.tab === "gallery" && out.length === 0);
  updateCounts();

  if (els.countTotal) els.countTotal.textContent = STATE.allItems.length.toString();
  if (els.countFiltered) els.countFiltered.textContent = STATE.filtered.length.toString();
}

/* ---------- chunked render / infinite scroll ---------- */
function startRender(){
  const g = els.gallery;
  g.innerHTML = "";
  renderCursor = 0;
  if (io) { io.disconnect(); io = null; }

  // sentinel to trigger loading
  const sentinel = document.createElement("div");
  sentinel.id = "sentinel";
  sentinel.style.height = "1px";
  g.appendChild(sentinel);

  renderChunk();

  if (renderCursor < STATE.filtered.length) {
    io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        renderChunk();
        if (renderCursor >= STATE.filtered.length && io) {
          io.disconnect();
          io = null;
        }
      }
    }, { root: null, rootMargin: "800px 0px", threshold: 0 });

    io.observe(sentinel);
  }
}

function renderChunk(){
  const g = els.gallery;
  const frag = document.createDocumentFragment();
  const end = Math.min(renderCursor + RENDER_BATCH, STATE.filtered.length);

  for (let i = renderCursor; i < end; i++) {
    const card = buildCard(STATE.filtered[i], i);
    frag.appendChild(card);
  }

  g.appendChild(frag);
  renderCursor = end;

  // keep sentinel last child
  const sentinel = g.querySelector("#sentinel");
  if (sentinel) g.appendChild(sentinel);
}

function buildCard(item, index){
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.idx = String(index);

  let mediaEl;

  if ((item.isVideo || item.type === "video") && (item.path || item.url)){
    const v = document.createElement("video");
    v.className = "thumb";
    v.controls = true;
    v.preload = "metadata";
    v.playsInline = true;
    v.src = buildAbsoluteUrl(item.path || item.url);
    v.title = item.title;
    mediaEl = v;

  } else if (item.type === "youtube" && item.youtubeId){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumb";
    btn.style.position = "relative";
    btn.style.cursor = "pointer";
    btn.setAttribute("aria-label", `Play on YouTube: ${item.title || item.youtubeId}`);

    const img = document.createElement("img");
    img.className = "thumb";
    img.alt = item.title || "YouTube";
    img.loading = "lazy";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "low");
    img.src = buildAbsoluteUrl(item.thumb || `https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`);
    btn.appendChild(img);

    const play = document.createElement("div");
    play.style.position = "absolute";
    play.style.inset = "0";
    play.style.display = "grid";
    play.style.placeItems = "center";
    play.innerHTML =
      '<div style="width:68px;height:48px;background:rgba(0,0,0,.6);border-radius:10px;display:grid;place-items:center;">' +
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="white" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
      "</div>";
    btn.appendChild(play);

    mediaEl = btn;

  } else if (item.type === "tenor" && (item.url || item.thumb)){
    const img = document.createElement("img");
    img.className = "thumb";
    img.alt = item.title || "Tenor GIF";
    img.loading = "lazy";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "low");
    img.width = 1280; img.height = 720;
    img.src = buildAbsoluteUrl(item.thumb || item.url);
    mediaEl = img;

  } else {
    const img = document.createElement("img");
    img.className = "thumb";
    img.alt = item.title || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.setAttribute("fetchpriority", "low");
    img.width = 1280; img.height = 720;
    img.src = buildAbsoluteUrl(item.thumb || item.path || item.url || "");
    mediaEl = img;
  }

  card.appendChild(mediaEl);

  const meta = document.createElement("div");
  meta.className = "meta";

  const left = document.createElement("div");
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = item.title || "Untitled";
  left.appendChild(title);

  const badges = document.createElement("div"); badges.className = "badges";
  badges.innerHTML = `
    <span class="badge" title="Skin">${escapeHtml(item.skinName)}</span>
    <span class="badge" title="Type">${escapeHtml(TYPE_LABEL[item.type] || item.type)}</span>
    ${item.year ? `<span class="badge" title="Original skin release year">${item.year}</span>` : ""}
      ${(item.tags||[]).map(t => `<span class="badge" data-tag="${escapeHtml(t)}"title="Tag: ${escapeHtml(TAG_LABEL[t] || t)}">${escapeHtml(TAG_LABEL[t] || t)}</span>`).join("")}
  `;
  left.appendChild(badges);

  const actions = document.createElement("div");
  actions.className = "actions";

  const absPath = item.path ? buildAbsoluteUrl(item.path) : (item.url ? buildAbsoluteUrl(item.url) : null);
  if (absPath) {
    const rawLink = document.createElement("a");
    rawLink.className = "action";
    rawLink.href = absPath;
    rawLink.target = "_blank";
    rawLink.rel = "noopener";
    rawLink.textContent = "Open raw";
    actions.appendChild(rawLink);

    const copyBtn = document.createElement("button");
    copyBtn.className = "action js-copy";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy path";
    copyBtn.setAttribute("data-path", absPath);
    actions.appendChild(copyBtn);
  }

  if (item.youtubeId) {
    const y = document.createElement("a");
    y.className = "action";
    y.href = `https://www.youtube.com/watch?v=${item.youtubeId}`;
    y.target = "_blank";
    y.rel = "noopener";
    y.textContent = "YouTube";
    actions.appendChild(y);
  }

  meta.appendChild(left);
  meta.appendChild(actions);
  card.appendChild(meta);

  return card;
}
/* ---------- end chunked rendering ---------- */

function openViewer(item){
  const dlg = els.viewer;
  const wrap = dlg.querySelector(".viewer-content");
  wrap.innerHTML = "";

  let media;
  if((item.isVideo || item.type === "video") && (item.path || item.url)){
    media = document.createElement("video");
    media.className = "viewer-media";
    media.controls = true; media.autoplay = true; media.src = buildAbsoluteUrl(item.path || item.url); media.playsInline = true;

  } else if(item.type === "youtube" && item.youtubeId){
    const frame = document.createElement("div");
    frame.className = "viewer-embed";
    const iframe = document.createElement("iframe");
    iframe.className = "viewer-iframe";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.src = `https://www.youtube.com/embed/${item.youtubeId}?autoplay=1`;
    frame.appendChild(iframe);
    media = frame;

  } else if(item.type === "tenor" && (item.url || item.thumb)){
    const img = document.createElement("img");
    img.className = "viewer-media";
    img.alt = item.title || "Tenor GIF";
    img.src = buildAbsoluteUrl(item.url || item.thumb);
    media = img;

  } else {
    const img = document.createElement("img");
    img.className = "viewer-media";
    img.alt = item.title;
    img.src = buildAbsoluteUrl(item.path || item.url || item.thumb || "");
    media = img;
  }

  const abs = item.path ? buildAbsoluteUrl(item.path) : (item.url ? buildAbsoluteUrl(item.url) : null);

  const caption = document.createElement("div");
  caption.className = "viewer-caption";
  caption.innerHTML = `
    <div class="left">
      <strong>${escapeHtml(item.title || "")}</strong>
      <span class="badge" title="Skin">${escapeHtml(item.skinName)}</span>
      <span class="badge" title="Type">${escapeHtml(TYPE_LABEL[item.type] || item.type)}</span>
      ${item.year ? `<span class="badge" title="Original skin release year">${item.year}</span>` : ""}
      ${(item.tags||[]).map(t => `<span class="badge" data-tag="${escapeHtml(t)}"title="Tag: ${escapeHtml(TAG_LABEL[t] || t)}">${escapeHtml(TAG_LABEL[t] || t)}</span>`).join("")}
    </div>
    <div class="right">
      ${abs ? `<a class="action" target="_blank" rel="noopener" href="${abs}">Open raw</a>` : ""}
      ${abs ? `<button class="action js-copy" data-path="${abs}" type="button">Copy path</button>` : ""}
      ${item.youtubeId ? `<a class="action" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${item.youtubeId}">YouTube</a>` : ""}
    </div>
  `;

  wrap.appendChild(media);
  wrap.appendChild(caption);

  const copyBtn = caption.querySelector(".js-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const url = copyBtn.getAttribute("data-path") || "";
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
      } catch {
        copyBtn.textContent = "Failed";
        setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
      }
    });
  }

  const closeBtn = dlg.querySelector(".viewer-close");
  closeBtn.onclick = () => dlg.close();
  if(!dlg.open) dlg.showModal();
}

function renderFilesTree(){
  const bySkin = groupBy(STATE.allItems, i => i.skinName);
  const container = els.filesTree;
  container.innerHTML = "";

  for(const [skin, items] of bySkin){
    const skinNode = mkNode(skin);
    const byType = groupBy(items, i => TYPE_LABEL[i.type] || i.type);
    for(const [type, arr] of byType){
      const typeNode = mkNode(type);
      for(const it of arr){
        const leaf = document.createElement("div");
        leaf.className = "node";
        const name = it.path
          ? it.path.split("/").slice(-1)[0]
          : (it.url ? (it.url.split("/").slice(-1)[0] || it.title || it.youtubeId) : (it.youtubeId || it.title));
        const abs = it.path ? buildAbsoluteUrl(it.path) : (it.url ? buildAbsoluteUrl(it.url) : "");
        leaf.innerHTML = `
          <span>${escapeHtml(name)}</span>
          <span class="file-actions">
            ${abs ? `<a href="${abs}" target="_blank" rel="noopener">open</a>` : ""}
            ${it.youtubeId ? `<a href="https://www.youtube.com/watch?v=${it.youtubeId}" target="_blank" rel="noopener">youtube</a>` : ""}
            ${abs ? `<button class="copy" data-text="${abs}">copy path</button>` : ""}
          </span>
        `;
        typeNode.appendChild(leaf);
      }
      skinNode.appendChild(typeNode);
    }
    container.appendChild(skinNode);
  }

  container.querySelectorAll("button.copy").forEach(btn=>{
    btn.addEventListener("click", async e=>{
      const url = e.currentTarget.getAttribute("data-text") || "";
      try{
        await navigator.clipboard.writeText(url);
        e.currentTarget.textContent="copied";
        setTimeout(()=>e.currentTarget.textContent="copy path",1200);
      }catch{}
    });
  });

  function mkNode(label){
    const d = document.createElement("div");
    d.className = "node";
    d.innerHTML = `<strong>${escapeHtml(label)}</strong>`;
    return d;
  }
}

function groupBy(arr, keyFn){
  const map = new Map();
  for(const item of arr){
    const key = keyFn(item);
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function inferTitleFromPath(p, yt){
  if(yt) return `YouTube ${yt}`;
  if(!p) return "";
  const base = (p.split("/").pop() || p);
  return base.replace(/\.[a-z0-9]+$/i,"").replace(/[-_]/g," ").trim();
}

function cleanTitle(s){
  if(!s) return s;
  let t = s;

  // Remove in [brackets]
  t = t.replace(/\[[^\]]*\]/g, "");

  // Remove short tag groups like (WR), (TFT), (LoR), (timfernix)
  t = t.replace(/\((?:\s*(?:wr|tft|lor|wild rift|teamfight tactics|legends of runeterra|timfernix)\s*[,&/]?)+\)/gi, "");

  // Remove __tokens
  t = t.replace(/__([a-z0-9-]+)/gi, "");

  // Remove isolated tag tokens
  t = t.replace(/(?:^|[\s_\-])(wr|tft|lor|timfernix)(?=$|[\s_\-])/gi, "");

  // Normalize separators/space
  t = t.replace(/[-_]+/g, " ").replace(/\s{2,}/g, " ").trim();

  return t;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function normalizeTags(arr){
  const set = new Set();
  for(const t of (arr||[])){
    if(!t) continue;
    set.add(String(t).toLowerCase());
  }
  return [...set];
}

/* ---------- URL helpers ---------- */
function buildAbsoluteUrl(p){
  if(!p) return "";
  if (/^https?:\/\//i.test(p)) return p;
  const base = location.origin + location.pathname.replace(/index\.html?$/,"");
  return base + encodePathSegments(p);
}
function encodePathSegments(p){
  const noDot = String(p).replace(/^\.\//,"");
  const parts = noDot.split("/");
  const enc = parts.map(seg => seg === "" ? "" : encodeURIComponent(safeDecode(seg)));
  return enc.join("/");
}
function safeDecode(s){
  try{ return decodeURIComponent(s); }catch(_){}
  try{ return decodeURI(s); }catch(_){}
  return s;
}
