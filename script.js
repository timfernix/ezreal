const STATE = {
  allItems: [],
  filtered: [],
  skin: "all",
  types: new Set([
    "splash","icon","promo","concept",
    "loading","model","model-face",
    "chroma","video","youtube","emote","other","tenor", "ingame"
  ]),
  tags: new Set(),
  search: "",
  sortBy: "skin",
  tab: "gallery",
};

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
  other: "Other",
  tenor: "GIF - by timfernix",
  ingame: "Abilities - by timfernix",
};

const TAG_LABEL = {
  tft: "TFT",
  wr: "Wild Rift",
  lor: "Legends of Runeterra",
  chroma: "Chroma",
  lol: "League of Legends",
};

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
};

init().catch(console.error);

async function init(){
  hydrateTheme();
  wireUI();
  await loadManifest();
  renderFilters();
  applyFilters();
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
  els.skinFilter?.addEventListener("change", e => { STATE.skin = e.target.value; applyFilters(); });
  els.typeChecks().forEach(cb => cb.addEventListener("change", ev => {
    const c = ev.currentTarget;
    if(c.checked) STATE.types.add(c.value); else STATE.types.delete(c.value);
    applyFilters();
  }));
  els.tagChecks().forEach(cb => cb.addEventListener("change", ev => {
    const c = ev.currentTarget;
    if(c.checked) STATE.tags.add(c.value); else STATE.tags.delete(c.value);
    applyFilters();
  }));
  els.search?.addEventListener("input", e => { STATE.search = e.target.value.trim().toLowerCase(); applyFilters(); });
  els.sortBy?.addEventListener("change", e => { STATE.sortBy = e.target.value; applyFilters(); });
  els.tabs().forEach(btn => btn.addEventListener("click", onTab));
  document.addEventListener("keydown", e => { if(e.key === "Escape" && els.viewer.open) els.viewer.close(); });
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

    const items = [];
    for(const skin of (data.skins || [])){
      const skinId = skin.id;
      const skinName = skin.name || skinId;
      const year = skin.release_year || null;

      for(const m of (skin.media || [])){
        const tags = normalizeTags(m.tags || []);

        // keep chroma consistency
        if(m.type === "chroma" && !tags.includes("chroma")) tags.push("chroma");

        // NEW: add "lol" when no cross-game tag is present
        const hasGameTag = tags.includes("tft") || tags.includes("wr") || tags.includes("lor");
        if(!hasGameTag) tags.push("lol");

        items.push({
          skinId,
          skinName,
          year,
          type: m.type,
          title: cleanTitle(m.title || inferTitleFromPath(m.path || m.url, m.youtubeId)),
          path: m.path || null,
          url: m.url || null,
          youtubeId: m.youtubeId || null,
          thumb: m.thumb || null,
          tags
        });
      }
    }
    STATE.allItems = items;
  }catch(err){
    console.warn("Failed to load manifest:", err);
    STATE.allItems = [];
  }
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

  if (STATE.tags.size > 0) {
    out = out.filter(i => (i.tags || []).some(tag => STATE.tags.has(tag)));
  }

  if(STATE.search){
    const q = STATE.search;
    out = out.filter(i =>
      (i.title||"").toLowerCase().includes(q) ||
      (i.skinName||"").toLowerCase().includes(q) ||
      (i.type||"").toLowerCase().includes(q) ||
      String(i.year||"").includes(q) ||
      (i.tags||[]).join(" ").toLowerCase().includes(q)
    );
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
  renderGallery();
  els.empty.hidden = !(STATE.tab === "gallery" && out.length === 0);
  updateCounts();

  if (els.countTotal) els.countTotal.textContent = STATE.allItems.length.toString();
  if (els.countFiltered) els.countFiltered.textContent = STATE.filtered.length.toString();
}

function renderGallery(){
  const g = els.gallery;
  g.innerHTML = "";
  const frag = document.createDocumentFragment();

  for(const item of STATE.filtered){
    const card = document.createElement("article");
    card.className = "card";

    let mediaEl;

    if (item.type === "video" && (item.path || item.url)){
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

      btn.addEventListener("click", () => openViewer(item));
      mediaEl = btn;

    } else if (item.type === "tenor" && (item.url || item.thumb)) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = item.title || "Tenor GIF";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = buildAbsoluteUrl(item.thumb || item.url);
      img.addEventListener("click", () => openViewer(item));
      mediaEl = img;

    } else {
      const img = document.createElement("img");
      img.className = "thumb";
      img.alt = item.title || "";
      img.loading = "lazy";
      img.decoding = "async";
      img.src = buildAbsoluteUrl(item.thumb || item.path || item.url || "");
      img.addEventListener("click", () => openViewer(item));
      mediaEl = img;
    }

    if (!(mediaEl instanceof Node)) {
      console.warn("Skipping item with invalid media node:", item);
      continue;
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
      ${(item.tags||[]).map(t => `<span class="badge" title="Tag: ${escapeHtml(TAG_LABEL[t] || t)}">${escapeHtml(TAG_LABEL[t] || t)}</span>`).join("")}
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
      copyBtn.addEventListener("click", async () => {
        const url = absPath;
        try {
          await navigator.clipboard.writeText(url);
          copyBtn.textContent = "Copied";
          setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
        } catch {
          copyBtn.textContent = "Failed";
          setTimeout(() => (copyBtn.textContent = "Copy path"), 1200);
        }
      });
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

    frag.appendChild(card);
  }

  g.appendChild(frag);
}

function openViewer(item){
  const dlg = els.viewer;
  const wrap = dlg.querySelector(".viewer-content");
  wrap.innerHTML = "";

  let media;
  if(item.type === "video" && (item.path || item.url)){
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
      ${(item.tags||[]).map(t => `<span class="badge" title="Tag: ${escapeHtml(TAG_LABEL[t] || t)}">${escapeHtml(TAG_LABEL[t] || t)}</span>`).join("")}
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

  // Remove short tag groups like (WR), (TFT), (LoR)
  t = t.replace(/\((?:\s*(?:wr|tft|lor|wild rift|teamfight tactics|legends of runeterra)\s*[,&/]?)+\)/gi, "");

  // Remove __tokens
  t = t.replace(/__([a-z0-9-]+)/gi, "");

  // Remove isolated tag tokens
  t = t.replace(/(?:^|[\s_\-])(wr|tft|lor)(?=$|[\s_\-])/gi, "");

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
